// OpenAI 兼容适配器（P3-T2）：当前唯一接入方 = 小米 MiMo（PRD 附录 B），但协议本身通用，
// 后续新增 OpenAI 兼容端点可直接复用本文件，无需专用 SDK。

import type { ProviderConfig } from '../../shared/types';
import { ErrorFactory, ErrorLayer, LubanError, makeError } from '../../shared/errors';
import type { AIProvider, ChatRequestOptions, TestConnectionResult } from './base';
import { registerProvider } from './base';

function endpointUrl(config: ProviderConfig): string {
  return `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function headers(config: ProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-key': config.apiKey,
    Authorization: `Bearer ${config.apiKey}`,
  };
}

async function doFetch(config: ProviderConfig, body: unknown, signal: AbortSignal): Promise<Response> {
  const res = await fetch(endpointUrl(config), {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsedBody: unknown = text;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      /* 非 JSON 错误体，原样保留文本 */
    }
    throw openaiCompatibleProvider.mapHttpError(res.status, parsedBody, res.headers);
  }
  return res;
}

export const openaiCompatibleProvider: AIProvider = {
  id: 'openai-compatible',

  async streamChatCompletion(config: ProviderConfig, opts: ChatRequestOptions): Promise<Response> {
    const body = {
      model: config.model,
      messages: opts.messages,
      response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
      thinking: { type: opts.thinking ? 'enabled' : 'disabled' },
      stream: true,
    };
    return doFetch(config, body, opts.signal);
  },

  async testConnection(config: ProviderConfig, signal: AbortSignal): Promise<TestConnectionResult> {
    const start = performance.now();
    try {
      await doFetch(
        config,
        {
          model: config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        },
        signal,
      );
      return { ok: true, latencyMs: Math.round(performance.now() - start) };
    } catch (e) {
      return { ok: false, error: e instanceof LubanError ? e : toUnexpected(e) };
    }
  },

  mapHttpError(status, body, headers) {
    const message = extractMessage(body);
    if (status === 401) return ErrorFactory.keyInvalid();
    if (status === 403) return ErrorFactory.keyExpired();
    if (status === 429) {
      const retryAfter = headers.get('retry-after');
      const seconds = retryAfter ? Number(retryAfter) : undefined;
      const suffix = seconds && !Number.isNaN(seconds) ? `，约 ${seconds} 秒后可重试` : '';
      return makeError(ErrorLayer.NETWORK, 'RATE_LIMITED', `调用太频繁，稍等片刻后重试${suffix}。`, [
        { type: 'RETRY' },
      ]);
    }
    return makeError(
      ErrorLayer.NETWORK,
      `HTTP_${status}`,
      message ? `AI 服务返回错误：${message}` : `AI 服务返回错误（HTTP ${status}）。`,
      [{ type: 'RETRY' }, { type: 'DISMISS' }],
    );
  },
};

function extractMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body || undefined;
  if (body && typeof body === 'object') {
    const err = (body as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return undefined;
}

function toUnexpected(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|NetworkError|net::ERR/i.test(message)) {
    return makeError(ErrorLayer.NETWORK, 'OFFLINE', '网络不可用', [{ type: 'RETRY' }]);
  }
  return makeError(ErrorLayer.NETWORK, 'UNEXPECTED', message || '网络请求失败。', [{ type: 'RETRY' }]);
}

registerProvider(openaiCompatibleProvider);
