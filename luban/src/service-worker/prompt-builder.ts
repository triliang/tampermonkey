// Prompt Builder（PRD §I / P3-T3）：System Prompt 固定约束 + 上下文拼装 + token 预算裁剪 +
// AI 返回 JSON 的容错解析链。纯函数，不直接发网络请求（解耦，便于单测 mock AI 调用）。

import { TOKEN_BUDGET } from '../shared/constants';
import { ErrorFactory } from '../shared/errors';
import type { GenerationResult, PageContext, TargetElement } from '../shared/types';
import type { RegenerateContext } from '../shared/messages';
import type { ChatMessage } from './ai-providers/base';
import { describeOutgoingContext } from './outgoing-context';

export type { OutgoingContextDescription, OutgoingScope } from './outgoing-context';
export { describeOutgoingContext } from './outgoing-context';

/** System Prompt（§I.1 四类硬约束，固定随每次生成请求下发）。 */
export const SYSTEM_PROMPT = `你是「鲁班」——一个为用户生成可在浏览器用户脚本环境运行的网页自动化 JavaScript 脚本的助手。严格遵守以下约束：

【安全约束】
1. 禁止生成删除/破坏数据类操作（如 localStorage.clear()、批量 GM_deleteValue、清空表单后提交）。
2. 禁止外发敏感信息（cookie、密码框内容、token、个人身份信息）到第三方域名。
3. 禁止资金类不可逆操作（下单、支付、转账、批量点击"删除/确认收货"）。
4. 禁止恶意逻辑（键盘记录、钓鱼替换、绕过验证码）。
5. 禁止死循环或全文档高频轮询等拖垮页面性能的写法。
6. 仅可调用用户上下文中 capabilities.gmApis 白名单内的 GM_* API。

【输出格式约束】
1. 必须返回单个结构化 JSON 对象，不得输出 Markdown 代码围栏，不得输出任何前后缀说明文字。
2. 六个字段全部必填：code、explanation、selectors、gmGrants、confidence、warnings（warnings 允许为空数组）。
3. code 为纯 JavaScript，不得包含 <script> 标签或 HTML 片段。

【选择器质量要求】
1. 优先级：语义化 id > 稳定 class（非哈希/非动态后缀）> data-* 等属性选择器 > 结构组合（tag + nth-child），绝对路径仅作兜底。
2. 回避脆弱选择器：构建工具生成的 class（如 css-1a2b3c / jsx-123）、纯文本匹配、超长绝对路径。
3. selectors 数组按稳健度降序给出主选择器 + 回退链，脚本内按序 try/catch 逐级回退。
4. 元素位于跨域 iframe / Shadow DOM 时，须在 warnings 中说明并给出穿透方案。

【脚本质量要求】
1. 防御性编码：所有 querySelector 判空，DOM 未就绪时等待。
2. 错误处理：顶层 try/catch，失败时 console.warn 记录。
3. 幂等安全：重复运行不叠加副作用。
4. 注释完整：头部注释块（意图/生成时间）+ 关键分支注释。
5. 代码风格：const/let、async/await，不依赖外部库。
6. 性能：批量 DOM 操作合并执行，避免全文档 MutationObserver 轮询。`;

/** AI 返回 Schema 说明 + 极简示例（随 user message 一并下发）。 */
const SCHEMA_HINT = `请严格按以下 JSON Schema 返回（仅返回 JSON，不要任何其他文字）：
{
  "code": "string，可运行的 JavaScript 脚本",
  "explanation": "string，自然语言解释这段脚本会做什么",
  "selectors": ["string，脚本中使用的 CSS 选择器列表"],
  "gmGrants": ["string，需要的 GM_* API 权限"],
  "confidence": "number，0-1，对生成结果的置信度",
  "warnings": ["string，潜在风险提示，可为空数组"]
}
示例：{"code":"console.log(1)","explanation":"打印日志","selectors":[],"gmGrants":[],"confidence":0.9,"warnings":[]}`;

/** token 估算（§3.4）：中文字符按 1.5 token/字估算，其余按 4 字符/token 估算。 */
export function estimateTokens(text: string): number {
  let chinese = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff]/.test(ch)) chinese += 1;
    else other += 1;
  }
  return Math.ceil(chinese * 1.5 + other / 4);
}

interface ContextPayload {
  meta: PageContext['meta'];
  target?: TargetElement;
  domSummary: Partial<PageContext['domSummary']>;
  intent: { raw: string };
  capabilities: { gmApis: readonly string[]; runAt: string; world: string };
}

const GM_CAPABILITIES = {
  gmApis: ['GM_addStyle', 'GM_setValue', 'GM_getValue', 'GM_deleteValue', 'GM_info', 'unsafeWindow'] as const,
  runAt: 'document-end',
  world: 'MAIN',
};

function buildPayload(context: PageContext, intent: string): ContextPayload {
  const outgoing = describeOutgoingContext(context);
  const payload: ContextPayload = {
    meta: outgoing.meta,
    domSummary: {
      ...context.domSummary,
      counts: outgoing.summaryCounts,
    },
    intent: { raw: intent },
    capabilities: GM_CAPABILITIES,
  };
  if (context.target !== null) {
    payload.target = {
      ...context.target,
      tag: outgoing.element.tag,
      text: outgoing.element.text,
    };
  }
  return payload;
}

/**
 * 分级裁剪，直到 user message 落在 token 预算内：
 * target/intent 永不裁剪（AI 定位目标元素的核心依据）→ 先裁 domSummary.inputs/buttons →
 * 仍超限再裁 target.siblings。每步裁剪后重新估算，裁到 0 仍超限则停止（prompt 本身过大，交给上游报警）。
 */
export function buildUserContent(
  context: PageContext,
  intent: string,
  budget = TOKEN_BUDGET.user,
  regenerateContext?: RegenerateContext,
): string {
  const payload = buildPayload(context, intent);
  const regenSuffix = regenerateContext ? renderRegenerateSuffix(regenerateContext) : '';
  const render = (): string => `${JSON.stringify(payload)}\n\n用户意图：${intent}\n\n${SCHEMA_HINT}${regenSuffix}`;

  if (estimateTokens(render()) <= budget) return render();

  const domSummary = payload.domSummary as PageContext['domSummary'];
  while (estimateTokens(render()) > budget && (domSummary.inputs.length > 0 || domSummary.buttons.length > 0)) {
    if (domSummary.inputs.length > 0) domSummary.inputs = domSummary.inputs.slice(0, -1);
    else domSummary.buttons = domSummary.buttons.slice(0, -1);
  }
  if (estimateTokens(render()) <= budget) return render();

  while (estimateTokens(render()) > budget && payload.target && payload.target.siblings.length > 0) {
    payload.target.siblings = payload.target.siblings.slice(0, -1);
  }
  return render();
}

/** 组装「上一轮代码 + 警告 + 用户补充要求」追加段（§P4-T4，重新生成携带失败上下文）。 */
function renderRegenerateSuffix(ctx: RegenerateContext): string {
  return `\n\n【重新生成】上一轮生成的代码：\n${ctx.previousCode}\n\n上一轮安全/质量警告：${JSON.stringify(ctx.previousWarnings)}\n\n用户补充要求：${ctx.extraRequirement && ctx.extraRequirement.trim() ? ctx.extraRequirement : '（无，仅需修正上述警告）'}\n请基于以上反馈输出修正后的完整脚本（仍返回完整 JSON，不要只给 diff）。`;
}

/** 组装完整消息数组（system + user），供 ai-client 直接消费。 */
export function buildMessages(context: PageContext, intent: string, regenerateContext?: RegenerateContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserContent(context, intent, TOKEN_BUDGET.user, regenerateContext) },
  ];
}

/** 追加「必须输出纯 JSON」强化指令（容错重试第二轮，§I.3 解析容错）。 */
export function buildStrengthenedMessages(context: PageContext, intent: string, regenerateContext?: RegenerateContext): ChatMessage[] {
  const messages = buildMessages(context, intent, regenerateContext);
  const last = messages[messages.length - 1];
  last.content += '\n\n【重要】上一次输出不是合法 JSON。本次必须只输出一个纯 JSON 对象，不要任何 Markdown 围栏或说明文字。';
  return messages;
}

type ParsedResponse = Omit<GenerationResult, 'requestId' | 'safety' | 'model' | 'tokensUsed'>;

const REQUIRED_FIELDS = ['code', 'explanation', 'selectors', 'gmGrants', 'confidence', 'warnings'] as const;

function isValidShape(obj: unknown): obj is ParsedResponse {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    typeof o.explanation === 'string' &&
    Array.isArray(o.selectors) &&
    Array.isArray(o.gmGrants) &&
    typeof o.confidence === 'number' &&
    Array.isArray(o.warnings) &&
    REQUIRED_FIELDS.every((f) => f in o)
  );
}

/**
 * 容错解析链（§I.3）：直接 parse → 剥 Markdown 围栏重 parse → 正则提取首个 {...} 重 parse。
 * 三步均失败，或解析出的对象字段不全，返回 ok:false（由调用方决定是否触发强化重试）。
 */
export function parseAiResponse(raw: string): { ok: true; data: ParsedResponse } | { ok: false } {
  const attempts = [raw, stripMarkdownFence(raw), extractFirstJsonObject(raw)].filter(
    (s): s is string => s !== null,
  );
  for (const candidate of attempts) {
    try {
      const obj = JSON.parse(candidate);
      if (isValidShape(obj)) return { ok: true, data: obj };
    } catch {
      // 继续尝试下一种容错手段
    }
  }
  return { ok: false };
}

function stripMarkdownFence(raw: string): string | null {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1] : null;
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

/** 调用方注入的 AI 调用能力（结构兼容 AiClient.generate，解耦直接依赖，便于单测注入 mock）。 */
export interface AiCaller {
  generate(
    messages: ChatMessage[],
    model: string,
    onDelta: (acc: string) => void,
  ): Promise<string>;
}

/**
 * 两级生成 + 容错编排（§I.3 完整流程 + §4.1「AI 返回 JSON 解析失败」）：
 * 第一轮用 flashModel 直接生成并解析；解析失败则追加强化指令、切 proModel 重发一次；
 * 仍失败抛出 modelBadJson（携带 REGENERATE/EDIT_INTENT 恢复动作，不静默失败）。
 */
export async function generateWithFallback(
  caller: AiCaller,
  context: PageContext,
  intent: string,
  flashModel: string,
  proModel: string,
  onDelta: (acc: string) => void,
  regenerateContext?: RegenerateContext,
): Promise<ParsedResponse> {
  const first = await caller.generate(buildMessages(context, intent, regenerateContext), flashModel, onDelta);
  const firstParsed = parseAiResponse(first);
  if (firstParsed.ok) return firstParsed.data;

  const second = await caller.generate(buildStrengthenedMessages(context, intent, regenerateContext), proModel, onDelta);
  const secondParsed = parseAiResponse(second);
  if (secondParsed.ok) return secondParsed.data;

  throw ErrorFactory.modelBadJson();
}
