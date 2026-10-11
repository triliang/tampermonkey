// AI Client（P3-T2）：统一封装「发请求 → 流式解析 → 超时/重试/取消」，上层（prompt-builder/SW handler）
// 不需要关心 Provider 细节与 SSE 拼接，只拿到累计文本增量回调与最终结果。

import type { ProviderConfig } from '../shared/types';
import { ErrorFactory, LubanError } from '../shared/errors';
import { TIMING } from '../shared/constants';
import { parseOpenAIStream } from './sse-parser';
import type { ChatMessage } from './ai-providers/base';
import { getProvider } from './ai-providers/base';
import './ai-providers/openai-compatible'; // 注册 openai-compatible provider（引入即注册）

export interface GenerateCallbacks {
  /** 每次累计文本增长时触发（SW 侧据此推 GENERATION_PROGRESS）。 */
  onDelta: (accumulated: string) => void;
}

export interface GenerateOutcome {
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const PROVIDER_ID = 'openai-compatible';

/** 单次生成会话：持有 AbortController，暴露 cancel()，内部处理超时自动重试 1 次。 */
export class AiClient {
  private controller: AbortController | null = null;
  private userCancelled = false;

  /** 用户主动取消（如点击「取消」按钮），区别于超时触发的内部 abort。 */
  cancel(): void {
    this.userCancelled = true;
    this.controller?.abort();
  }

  async generate(
    config: ProviderConfig,
    messages: ChatMessage[],
    options: { jsonMode: boolean; thinking: boolean },
    callbacks: GenerateCallbacks,
  ): Promise<GenerateOutcome> {
    return this.attempt(config, messages, options, callbacks, 0);
  }

  private async attempt(
    config: ProviderConfig,
    messages: ChatMessage[],
    options: { jsonMode: boolean; thinking: boolean },
    callbacks: GenerateCallbacks,
    retryCount: number,
  ): Promise<GenerateOutcome> {
    const provider = getProvider(PROVIDER_ID);
    if (!provider) throw ErrorFactory.keyInvalid(); // 理论不可达：provider 常驻注册

    this.controller = new AbortController();
    const timeoutMs = config.timeoutMs ?? TIMING.AI_TIMEOUT_MS;
    const timer = setTimeout(() => this.controller?.abort(), timeoutMs);

    try {
      const res = await provider.streamChatCompletion(config, {
        messages,
        jsonMode: options.jsonMode,
        thinking: options.thinking,
        signal: this.controller.signal,
      });
      if (!res.body) throw ErrorFactory.networkTimeout();

      let acc = '';
      let usage: GenerateOutcome['usage'];
      for await (const chunk of parseOpenAIStream(res.body)) {
        if (chunk.delta) {
          acc += chunk.delta;
          callbacks.onDelta(acc);
        }
        if (chunk.usage) usage = chunk.usage;
      }
      clearTimeout(timer);
      return { text: acc, usage };
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof LubanError) throw e; // provider 已翻译为中文错误（401/403/429 等）

      const aborted = e instanceof DOMException && e.name === 'AbortError';
      if (aborted && this.userCancelled) throw ErrorFactory.cancelled();
      if (aborted && retryCount === 0) {
        await delay(TIMING.RETRY_BACKOFF_MS);
        return this.attempt(config, messages, options, callbacks, retryCount + 1);
      }
      if (aborted) throw ErrorFactory.networkTimeout();
      throw e;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
