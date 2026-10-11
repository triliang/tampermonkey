import { describe, expect, it } from 'vitest';
import { SseParser, parseOpenAIStream } from './sse-parser';

function sseChunk(obj: { data: string; event?: string }[]): string {
  return obj.map((e) => (e.event ? `event: ${e.event}\n` : '') + `data: ${e.data}\n\n`).join('');
}

describe('SseParser', () => {
  it('解析单个完整事件', () => {
    const p = new SseParser();
    const events = p.push('data: hello\n\n');
    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('跨 chunk 断在 data 行中间，续接后仍能正确拼接', () => {
    const p = new SseParser();
    expect(p.push('data: hel')).toEqual([]);
    const events = p.push('lo\n\n');
    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('跨 chunk 断在事件分隔的空行处', () => {
    const p = new SseParser();
    expect(p.push('data: hello\n')).toEqual([]);
    const events = p.push('\n');
    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('一个 chunk 内含多条事件，全部正确切出', () => {
    const p = new SseParser();
    const events = p.push('data: a\n\ndata: b\n\ndata: c\n\n');
    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c']);
  });

  it('[DONE] 终止标记作为普通事件透传', () => {
    const p = new SseParser();
    const events = p.push('data: [DONE]\n\n');
    expect(events).toEqual([{ event: 'message', data: '[DONE]' }]);
  });

  it('空 data 行（纯心跳 data:）产出空字符串事件', () => {
    const p = new SseParser();
    const events = p.push('data:\n\n');
    expect(events).toEqual([{ event: 'message', data: '' }]);
  });

  it('未知/自定义 event 字段被正确记录', () => {
    const p = new SseParser();
    const events = p.push('event: ping\ndata: keepalive\n\n');
    expect(events).toEqual([{ event: 'ping', data: 'keepalive' }]);
  });

  it('多行 data 按规范用 \\n 拼接为一条事件', () => {
    const p = new SseParser();
    const events = p.push('data: line1\ndata: line2\n\n');
    expect(events).toEqual([{ event: 'message', data: 'line1\nline2' }]);
  });

  it('CRLF 换行与 LF 混用均能正确解析', () => {
    const p = new SseParser();
    const events = p.push('data: hello\r\n\r\n');
    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('纯注释行（: 开头）被忽略，不产出事件也不污染 data', () => {
    const p = new SseParser();
    const events = p.push(': keepalive comment\ndata: real\n\n');
    expect(events).toEqual([{ event: 'message', data: 'real' }]);
  });

  it('连续多个空行不会产出空事件（无 data 时忽略）', () => {
    const p = new SseParser();
    const events = p.push('\n\n\ndata: x\n\n');
    expect(events).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('flush() 吐出流结束时仍滞留在缓冲区的未终止事件（服务端未发尾部空行）', () => {
    const p = new SseParser();
    expect(p.push('data: tail')).toEqual([]);
    expect(p.flush()).toEqual([{ event: 'message', data: 'tail' }]);
  });

  it('真实 MiMo 风格 SSE 录制样本：多个 chunk 流式拼接出完整累计文本', () => {
    const chunks = [
      sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: '{"co' } }] }) }]),
      sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: 'de":"1' } }] }) }]),
      sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: '23"}' } }] }) }]),
      sseChunk([{ data: '[DONE]' }]),
    ];
    const p = new SseParser();
    const all = chunks.flatMap((c) => p.push(c));
    const text = all
      .filter((e) => e.data !== '[DONE]')
      .map((e) => (JSON.parse(e.data) as { choices: [{ delta: { content: string } }] }).choices[0].delta.content)
      .join('');
    expect(text).toBe('{"code":"123"}');
    expect(all.at(-1)?.data).toBe('[DONE]');
  });
});

describe('parseOpenAIStream', () => {
  function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let i = 0;
    return new ReadableStream({
      pull(controller) {
        if (i < chunks.length) {
          controller.enqueue(encoder.encode(chunks[i++]));
        } else {
          controller.close();
        }
      },
    });
  }

  it('累计拼接 delta.content 并在 [DONE] 后标记 done', async () => {
    const stream = streamFrom([
      sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: 'He' } }] }) }]),
      sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: 'llo' } }] }) }]),
      sseChunk([{ data: '[DONE]' }]),
    ]);
    const parts: string[] = [];
    let done = false;
    for await (const c of parseOpenAIStream(stream)) {
      if (c.delta) parts.push(c.delta);
      if (c.done) done = true;
    }
    expect(parts.join('')).toBe('Hello');
    expect(done).toBe(true);
  });

  it('畸形 JSON 行跳过，不中断整条流', async () => {
    const stream = streamFrom(['data: not-json\n\n', sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) }]), sseChunk([{ data: '[DONE]' }])]);
    const parts: string[] = [];
    for await (const c of parseOpenAIStream(stream)) {
      if (c.delta) parts.push(c.delta);
    }
    expect(parts.join('')).toBe('ok');
  });

  it('usage 字段随最终 chunk 透传', async () => {
    const stream = streamFrom([
      sseChunk([{ data: JSON.stringify({ choices: [{ delta: {} }], usage: { total_tokens: 42 } }) }]),
      sseChunk([{ data: '[DONE]' }]),
    ]);
    let usage: { total_tokens?: number } | undefined;
    for await (const c of parseOpenAIStream(stream)) {
      if (c.usage) usage = c.usage;
    }
    expect(usage?.total_tokens).toBe(42);
  });

  it('解析 1MB 规模的流 < 50ms', async () => {
    const bigChunks: string[] = [];
    for (let i = 0; i < 2000; i++) {
      bigChunks.push(sseChunk([{ data: JSON.stringify({ choices: [{ delta: { content: 'x'.repeat(500) } }] }) }]));
    }
    bigChunks.push(sseChunk([{ data: '[DONE]' }]));
    const stream = streamFrom(bigChunks);
    const start = performance.now();
    let total = 0;
    for await (const c of parseOpenAIStream(stream)) {
      total += c.delta.length;
    }
    const elapsed = performance.now() - start;
    expect(total).toBe(2000 * 500);
    expect(elapsed).toBeLessThan(50);
  });
});
