import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiClient } from './ai-client';
import { ErrorLayer, LubanError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';

function sseBody(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < parts.length) controller.enqueue(encoder.encode(parts[i++]));
      else controller.close();
    },
  });
}

function sseLine(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

const config: ProviderConfig = {
  id: 'mimo',
  baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
  apiKey: 'tp-test',
  model: 'mimo-v2.6-flash',
  billing: 'tokenPlan',
};

describe('AiClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('成功流式响应：累计 delta 逐步到达，最终文本正确', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(sseBody([sseLine('He'), sseLine('llo'), 'data: [DONE]\n\n']), { status: 200 }),
      ),
    );
    const client = new AiClient();
    const deltas: string[] = [];
    const result = await client.generate(config, [{ role: 'user', content: 'hi' }], { jsonMode: true, thinking: false }, {
      onDelta: (acc) => deltas.push(acc),
    });
    expect(result.text).toBe('Hello');
    expect(deltas).toEqual(['He', 'Hello']);
  });

  it('401 → 映射为 Key 无效错误，携带 OPEN_SETTINGS 恢复动作', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 })),
    );
    const client = new AiClient();
    await expect(
      client.generate(config, [], { jsonMode: true, thinking: false }, { onDelta: () => {} }),
    ).rejects.toMatchObject({ layer: ErrorLayer.NETWORK, code: 'NET_KEY_INVALID' });
  });

  it('429 → 映射为限流错误，携带 RETRY 恢复动作', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '5' } })),
    );
    const client = new AiClient();
    try {
      await client.generate(config, [], { jsonMode: true, thinking: false }, { onDelta: () => {} });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LubanError);
      expect((e as LubanError).code).toBe('NET_RATE_LIMITED');
      expect((e as LubanError).actions).toEqual([{ type: 'RETRY' }]);
    }
  });

  it('超时：首次 abort 自动重试 1 次，第二次仍超时则报「生成超时」', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new DOMException('aborted', 'AbortError');
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new AiClient();
    const promise = client.generate(config, [], { jsonMode: true, thinking: false }, { onDelta: () => {} });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'NET_TIMEOUT' });
    // 第一次超时（60s）→ 退避 2s → 第二次超时（60s）
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancel() 主动取消：abort 后立即报「已取消」而非超时错误，且不重试', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new AiClient();
    const promise = client.generate(config, [], { jsonMode: true, thinking: false }, { onDelta: () => {} });
    client.cancel();
    await expect(promise).rejects.toMatchObject({ code: 'NET_CANCELLED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('testConnection 返回 {ok, latencyMs}（真实延迟场景的最小校验）', async () => {
    vi.useRealTimers();
    const { getProvider } = await import('./ai-providers/base');
    await import('./ai-providers/openai-compatible');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const provider = getProvider('openai-compatible')!;
    const result = await provider.testConnection(config, new AbortController().signal);
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });
});

it('V2.1 显式关闭超时重发，失败请求只发送一次',async()=>{
 const fetcher=vi.fn(async()=>{throw new DOMException('aborted','AbortError');});vi.stubGlobal('fetch',fetcher);
 try{const client=new AiClient();await expect(client.generate(config,[{role:'user',content:'test'}],{jsonMode:true,thinking:false,autoRetry:false},{onDelta:()=>{}})).rejects.toBeInstanceOf(LubanError);expect(fetcher).toHaveBeenCalledOnce();}finally{vi.unstubAllGlobals();}
});

it('推理内容仅通知状态，不混入最终 JSON 或文本回调',async()=>{
 const reasoning='PRIVATE_REASONING_NOT_FOR_OUTPUT';vi.stubGlobal('fetch',vi.fn(async()=>new Response(sseBody([`data: ${JSON.stringify({choices:[{delta:{reasoning_content:reasoning}}]})}\n\n`,sseLine('{"code":"ok"}'),'data: [DONE]\n\n']))));
 try{const onThinking=vi.fn(),onDelta=vi.fn();const result=await new AiClient().generate(config,[],{jsonMode:true,thinking:true,autoRetry:false},{onThinking,onDelta});expect(result.text).toBe('{"code":"ok"}');expect(onThinking).toHaveBeenCalledOnce();expect(JSON.stringify(onDelta.mock.calls)).not.toContain(reasoning);}finally{vi.unstubAllGlobals();}
});
it('推理独立流式回调与最终结果限量保留，正文不混入推理',async()=>{
 const large='中'.repeat(30000);vi.stubGlobal('fetch',vi.fn(async()=>new Response(sseBody([`data: ${JSON.stringify({choices:[{delta:{reasoning_content:large}}]})}\n\n`,sseLine('{"code":"ok"}'),'data: [DONE]\n\n']))));
 try{const onReasoning=vi.fn(),onDelta=vi.fn();const result=await new AiClient().generate(config,[],{jsonMode:true,thinking:true,autoRetry:false},{onReasoning,onDelta});expect(result.text).toBe('{"code":"ok"}');expect(new TextEncoder().encode(result.reasoning).length).toBeLessThanOrEqual(65536);expect(result.reasoning).not.toContain('�');expect(result.reasoningTruncated).toBe(true);expect(onReasoning).toHaveBeenCalledWith(result.reasoning,true);expect(JSON.stringify(onDelta.mock.calls)).not.toContain('中');}finally{vi.unstubAllGlobals();}
});
