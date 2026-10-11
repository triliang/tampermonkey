// Provider 抽象（§3.3 / P3-T2）：新增一个 OpenAI 兼容 Provider 只需实现本接口 + 注册到 registry，
// 不改 ai-client.ts 任何一行——这是「P1 加 Provider 只加文件」的落地方式。

import type { ProviderConfig } from '../../shared/types';
import type { LubanError } from '../../shared/errors';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequestOptions {
  messages: ChatMessage[];
  /** 结构化 JSON 输出（§I.1 输出格式双保险） */
  jsonMode: boolean;
  /** 复杂场景可开启思考模式（§B.3） */
  thinking: boolean;
  signal: AbortSignal;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs?: number;
  error?: LubanError;
}

/** 单个 AI Provider 的最小能力面：发起流式请求 + 连通性自检 + 把 HTTP 错误翻译成中文可读错误。 */
export interface AIProvider {
  readonly id: string;
  /** 发起 Chat Completions 流式请求，返回原始响应体（供 sse-parser 消费）。 */
  streamChatCompletion(config: ProviderConfig, opts: ChatRequestOptions): Promise<Response>;
  /** 连通性测试：发一个极小请求，仅用于验证 Key/BaseUrl 是否可用。 */
  testConnection(config: ProviderConfig, signal: AbortSignal): Promise<TestConnectionResult>;
  /** 把 HTTP status + 响应体翻译为统一的 LubanError（401/403/429/5xx 等）。 */
  mapHttpError(status: number, body: unknown, headers: Headers): LubanError;
}

const registry = new Map<string, AIProvider>();

export function registerProvider(provider: AIProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: string): AIProvider | undefined {
  return registry.get(id);
}
