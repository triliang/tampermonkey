// Options → SW 消息封装（同 sidepanel/comms.ts 模式，各上下文独立持有）。
import type { LubanMessage, LubanResponse } from '../shared/messages';
import { ErrorLayer } from '../shared/errors';

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
