// Side Panel → SW 消息封装。chrome.runtime.sendMessage 返回统一 LubanResponse。

import type { LubanMessage, LubanResponse } from '../shared/messages';
import { makeRequestId } from '../shared/messages';
import { ErrorLayer } from '../shared/errors';

/** 向 SW 发送消息并等待响应。SW 不可达（休眠/未装）时抛出可读错误。 */
export async function sendToSW<T = unknown>(msg: LubanMessage): Promise<LubanResponse<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as LubanResponse<T> | undefined;
    if (!res) {
      return {
        ok: false,
        error: { layer: ErrorLayer.NETWORK, code: 'NET_NO_RESPONSE', message: '后台无响应（Service Worker 可能已休眠）', actions: [{ type: 'RETRY' }] },
      };
    }
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: { layer: ErrorLayer.NETWORK, code: 'NET_SEND_FAILED', message, actions: [{ type: 'RETRY' }] },
    };
  }
}

/** 链路自检：请 SW 分别探测 content（ISOLATED）与 main（页面主上下文）。 */
export async function selfTest(): Promise<{ content: LubanResponse; main: LubanResponse }> {
  const [content, main] = await Promise.all([
    sendToSW({ type: 'PING', requestId: makeRequestId(), from: 'sw', to: 'content' }),
    sendToSW({ type: 'PING', requestId: makeRequestId(), from: 'sw', to: 'main' }),
  ]);
  return { content, main };
}
