// 跨上下文共享的领域数据类型（仅类型，零运行时）。
// 对齐技术设计 §3.2（上下文）、§3.3（Provider）、§3.5（注入兼容）、§3.6（GM_*）、§五（存储）。

/** 注入方法优先级（§3.5 降级链）：1=MAIN world，2=内联 script，3=Blob URL，4=不支持。 */
export type InjectionMethod = 1 | 2 | 3 | 4;

/** Provider 计费类型，决定 Key 前缀校验（§3.3）。 */
export type BillingType = 'tokenPlan' | 'onDemand';

/** AI Provider 配置（BYOK，存 local）。 */
export interface ProviderConfig {
  thinkingEnabled?:boolean;
  thinkingProtocol?:import('./thinking').ThinkingProtocol;
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  billing: BillingType;
  customEndpoint?: boolean;
  /** 可选：请求超时覆盖 */
  timeoutMs?: number;
}

export interface ValidationResult {
  ok: boolean;
  /** 校验失败的中文原因（对齐 i18n-strings） */
  message?: string;
}

/** 目标元素信息（§3.2 Phase 1，同步采集）。 */
export interface TargetElement {
  targetContext?:import('./v21-types').TargetContext;
  /** 按稳健度降序的选择器候选链 */
  selectorCandidates: string[];
  tag: string;
  text: string;
  attributes: Record<string, string>;
  /** 父级路径摘要 */
  contextPath: string;
  /** 相邻元素摘要 */
  siblings: string[];
}

/** 页面 DOM 摘要（§3.2 Phase 2，TreeWalker 限流遍历）。 */
export interface DOMSummary {
  counts: {
    inputs: number;
    buttons: number;
    forms: number;
    links: number;
    images: number;
  };
  /** 截断后的表单/交互元素摘要 */
  inputs: string[];
  buttons: string[];
  title: string;
  truncated: boolean;
  /** 有限结构定位线索，非整页 HTML。 */
  structure?: Array<{ tag: string; selectors: string[]; text: string; role?: string }>;
}

/** 上下文采集范围：点选元素 vs 整页摘要。 */
export type PageContextScope = 'element' | 'page';

/** 完整页面上下文（发送给 AI 前已脱敏，§3.2 Phase 3）。 */
export interface PageContext {
  scope: PageContextScope;
  meta: { url: string; title: string; siteType: string };
  target: TargetElement | null;
  domSummary: DOMSummary;
}

/** AI 流式增量块（SSE 解析产物，§3.3）。 */
export interface StreamChunk {
  /** 累计原始文本（含可能的 Markdown/JSON 围栏） */
  delta: string;
  done: boolean;
}

/** 安全扫描结果（§3.8）。 */
export interface SafetyReport {
  passed: boolean;
  /** 拦截级问题 */
  blocked: string[];
  /** 警告级问题 */
  warnings: string[];
}

/** 生成结果（AI 解析 + 扫描后，§3.4 / PRD §I.3）。 */
export interface GenerationResult {
  needsClarification?:{reason:'constraint_conflict'|'target_ambiguous'|'trigger_ambiguous';question:string};
  requestId: string;
  /** 用户脚本代码 */
  code: string;
  /** 自然语言解释 */
  explanation: string;
  /** AI 建议的选择器 */
  selectors: string[];
  /** 声明使用的 GM_* 权限 */
  gmGrants: string[];
  confidence: number;
  warnings: string[];
  /** 安全扫描结果 */
  safety: SafetyReport;
  model: string;
  tokensUsed: number;
}

/** 生成来源元信息（PRD §7 aiMeta）。 */
export interface ScriptAiMeta {
  intent: string;
  provider: string;
  model: string;
  pageContextSnapshot: { url: string; title: string };
  createdAt: number;
}

/** 已保存脚本（存 local，对齐 PRD §7）。 */
export interface UserScript {
  id: string;
  name: string;
  description: string;
  /** 侧栏展示用的效果说明，与 description 同步写入 */
  explanation: string;
  code: string;
  /** @match 规则，MVP 用于「再次运行」时校验当前页域名 */
  matches: string[];
  enabled: boolean;
  runAt: 'document-start' | 'document-end' | 'idle';
  source: 'ai' | 'manual';
  gmGrants: string[];
  aiMeta?: ScriptAiMeta;
  createdAt: number;
  updatedAt: number;
}

/** 脚本列表索引项（轻量，SCRIPTS_INDEX）。 */
export interface ScriptMeta {
  id: string;
  name: string;
  updatedAt: number;
  source: 'ai' | 'manual';
}

/** 全局非敏感设置（sync，§五）。API Key 本身绝不进本结构，单独存 local（§B.5）。 */
export interface Settings {
  thinkingEnabled?:boolean;
  customThinkingProtocol?:import('./thinking').ThinkingProtocol;
  pageAnalysisEnabled?: boolean;
  customEndpoint?: boolean;
  customBaseUrl?: string;
  customModel?: string;
  /** 默认模型（flash/pro） */
  defaultModel: string;
  /** 端点地区：cn/sgp/ams/onDemand */
  endpoint: keyof typeof import('./constants').MIMO.endpoints;
  /** 计费方式：决定 Key 前缀校验与 Base URL 取值（§3.3 / 附录 B.6） */
  billing: BillingType;
  /** 请求超时覆盖（ms），未设置时用 TIMING.AI_TIMEOUT_MS 默认值 */
  timeoutMs?: number;
  /** 是否开启上下文脱敏（默认 true，不可关（合规）——预留字段） */
  redactContext: boolean;
}

/** 站点注入兼容性（§3.5）。 */
export interface SiteCompatibility {
  domain: string;
  lastTested: number;
  injectionMethod: InjectionMethod;
  failures: { method: number; error: string; timestamp: number }[];
}

/** Side Panel 写入 session 的临时界面快照（SW 休眠后恢复）。 */
export interface UiSnapshot {
  phase: 'GENERATING' | 'PREVIEW';
  startedAt: number;
  updatedAt: number;
  intent: string;
  element: TargetElement | null;
  pageContext: PageContext | null;
  streamContent?: string;
  result?: GenerationResult;
}

/** 注入执行结果（INJECTION_RESULT）。 */
export interface InjectionResult {
  /** 注入与执行机制本身是否跑完整个流程（不代表用户代码有没有抛错，见 scriptError） */
  ok: boolean;
  method: InjectionMethod;
  /** 端到端注入耗时（ms） */
  timingMs: number;
  /** 注入层失败原因（CSP 拦截 / 无可用方法等），ok=false 时填充 */
  error?: string;
  /** 用户代码运行时抛出的错误或「10s 无完成信号」提示，ok 仍可为 true */
  scriptError?: string;
  /** GM_setValue/deleteValue 增量，由 SW 在有 scriptId 时回写 luban:gm:{id} */
  dirty?: Record<string, unknown>;
  /** CSP violation 摘要（若有） */
  violation?: unknown;
}
