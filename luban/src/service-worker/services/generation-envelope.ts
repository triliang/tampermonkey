import type { CapturedPage, GenerationEnvelope } from '../../shared/p2-types';
import type { ConversationMessage, ScriptVersion } from '../../shared/v2-types';
import type { PageContext } from '../../shared/types';
import type { ChatMessage } from '../ai-providers/base';
import { buildMessages, estimateTokens } from '../prompt-builder';
import { TOKEN_BUDGET } from '../../shared/constants';
import { sanitizePageUrl } from '../../shared/safe-url';
import { DataError } from '../repositories/database';

export function safePageContext(context: PageContext): PageContext {
  const result = structuredClone(context);
  result.meta.url = sanitizePageUrl(result.meta.url);
  if (result.target) for (const key of ['href', 'src', 'action']) {
    if (result.target.attributes[key]) result.target.attributes[key] = sanitizePageUrl(result.target.attributes[key], result.meta.url);
  }
  return result;
}
export function prepareEnvelope(input: { workspaceId: string; draftRevision: number; captured: CapturedPage; intent: string;
  workflowContext?:unknown; current: ScriptVersion | null; history: ConversationMessage[]; provider: GenerationEnvelope['provider'] }, inputBudget = TOKEN_BUDGET.total - TOKEN_BUDGET.response): GenerationEnvelope {
  if (!input.intent.trim()) throw new DataError('EMPTY_INTENT', '请先描述想怎样改这个网站。');
  const context = safePageContext(input.captured.context);
  const build = () => {const result=buildMessages(context, input.intent, input.current ? { previousCode: input.current.code, previousWarnings: [], extraRequirement: input.intent } : undefined);if(input.workflowContext)result[1].content+='\n已确认目标、保留约束与效果反馈（不允许扩大范围）：'+JSON.stringify(input.workflowContext);return result;};
  const history: ChatMessage[] = input.history.slice(-12).map(m => ({ role: m.role, content: m.text }));
  let removed = input.history.length - history.length;
  let base = build();
  const assemble = () => [base[0], ...history, base[1]];
  const retry = (messages: ChatMessage[]) => messages.map((m, i) => i === messages.length - 1 ? { ...m, content: m.content+'\n本次必须只返回完整的合法 JSON，不要代码围栏或解释前后缀。' } : { ...m });
  const cost = () => estimateTokens(JSON.stringify(retry(assemble())));
  while (cost() > inputBudget && history.length) { history.shift(); removed++; }
  while (cost() > inputBudget && context.domSummary.structure?.length) { context.domSummary.structure.pop(); base = build(); }
  if (cost() > inputBudget) throw new DataError('CONTEXT_TOO_LARGE', '当前代码或需求超过模型输入预算，请缩小任务；不会静默截断代码。');
  const messages = assemble();
  return { id: crypto.randomUUID(), workspaceId: input.workspaceId, draftRevision: input.draftRevision,
    binding: { ...input.captured.binding, url: sanitizePageUrl(input.captured.binding.url) }, createdAt: Date.now(),
    provider: input.provider, messages, retryMessages: retry(messages), estimatedInputTokens: cost(), historyRemoved: removed };
}
