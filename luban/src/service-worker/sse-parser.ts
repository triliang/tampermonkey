// SSE 增量解析器（§3.3 / P3-T1）：纯函数，零依赖，不持有任何 fetch/网络状态。
// 只负责把「可能跨 chunk 断开的原始字节/文本」正确切成一条条 SSE 事件的 data 负载。

/** 单条已解析完成的 SSE data 负载（已去掉 `data:` 前缀与首个空格）。 */
export interface SseEvent {
  /** `event:` 字段，未声明时为 'message'（SSE 规范默认值）。 */
  event: string;
  /** `data:` 字段原始内容（多行 data 用 \n 拼接，规范行为）。 */
  data: string;
}

/**
 * 增量 SSE 解析器：每次喂入一个 chunk（string），立即返回本次 chunk 内可以被
 * 完整切出的事件；跨 chunk 断在半行/半个字段的内容保留在内部缓冲，下次调用时续接。
 *
 * 为什么不用正则一次性 split：真实网络 chunk 边界与 SSE 事件边界无关，
 * 一个 `data: xxx\n\n` 完全可能被拆成两次 TCP/stream chunk，必须维护跨调用的行缓冲。
 */
export class SseParser {
  private buffer = '';
  private eventType = 'message';
  private dataLines: string[] = [];

  /** 喂入一个原始 chunk，返回本次新切出的完整事件（可能为空数组）。 */
  push(chunk: string): SseEvent[] {
    // 统一 CRLF/CR 为 LF，再按行处理——SSE 规范允许三种换行符。
    this.buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const events: SseEvent[] = [];

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const event = this.consumeLine(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** 流结束时调用：若缓冲中还有未被空行终止的事件，视为完整事件一并吐出（容忍服务端未发尾部空行）。 */
  flush(): SseEvent[] {
    const events: SseEvent[] = [];
    if (this.buffer.length > 0) {
      const event = this.consumeLine(this.buffer);
      this.buffer = '';
      if (event) events.push(event);
    }
    if (this.dataLines.length > 0) {
      events.push(this.finalizeEvent());
    }
    return events;
  }

  /** 处理单行；空行代表事件结束，产出一条 SseEvent。 */
  private consumeLine(line: string): SseEvent | null {
    if (line === '') {
      if (this.dataLines.length === 0) return null; // 连续空行/纯心跳，无 data 不产出事件
      return this.finalizeEvent();
    }
    if (line.startsWith(':')) return null; // SSE 注释行，忽略
    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) value = value.slice(1); // 规范：字段值首个空格是分隔符，非内容

    if (field === 'event') {
      this.eventType = value;
    } else if (field === 'data') {
      this.dataLines.push(value);
    }
    // 其余字段（id/retry）本产品未使用，解析但不保留。
    return null;
  }

  private finalizeEvent(): SseEvent {
    const event: SseEvent = { event: this.eventType, data: this.dataLines.join('\n') };
    this.eventType = 'message';
    this.dataLines = [];
    return event;
  }
}

/** OpenAI 兼容 Chat Completions 流式 delta 的最小结构（仅取用到的字段）。 */
export interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/** 高层封装：直接消费 `ReadableStream<Uint8Array>`，按 OpenAI 协议产出累计文本增量迭代器。 */
export async function* parseOpenAIStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ delta: string; done: boolean; usage?: ChatCompletionChunk['usage'] }, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      const events = done ? parser.flush() : parser.push(decoder.decode(value, { stream: true }));
      for (const evt of events) {
        if (evt.data === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }
        if (evt.data === '') continue;
        let parsed: ChatCompletionChunk;
        try {
          parsed = JSON.parse(evt.data) as ChatCompletionChunk;
        } catch {
          continue; // 畸形 data 行跳过，不中断整条流
        }
        const content = parsed.choices?.[0]?.delta?.content ?? '';
        if (content) yield { delta: content, done: false };
        if (parsed.usage) yield { delta: '', done: false, usage: parsed.usage };
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
