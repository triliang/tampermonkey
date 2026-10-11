// Content Script（ISOLATED world，按需注入）。
// 幂等：SW 可能对同一标签页多次 executeScript，用 window 标记守卫，避免重复注册监听。
// Phase 1 仅实现链路自检（PING/ECHO）与 START_PICKER 回执；采集/桥接随 Phase 2/5 落地。

import type { ElementPickedMsg, LubanMessage, PickCancelledMsg, PongMsg } from '../shared/messages';
import { makeRequestId } from '../shared/messages';
import { collectPageContext } from './context-engine';
import { startElementPicker, type PickerHandle } from './element-picker';
import { runViaScriptTag } from './event-bridge';
import { showResultToast } from './toast';
import { ErrorLayer, makeError } from '../shared/errors';

const LOADED_FLAG = '__luban_content_loaded';

interface GlobalWithFlag {
  [LOADED_FLAG]?: boolean;
}

function boot(): void {
  const g = globalThis as unknown as GlobalWithFlag;
  if (g[LOADED_FLAG]) return; // 已注入，避免重复注册
  g[LOADED_FLAG] = true;

  let activePicker: PickerHandle | null = null;

  function cancelActivePicker(): void {
    activePicker?.stop();
    activePicker = null;
  }

  chrome.runtime.onMessage.addListener((msg: LubanMessage, _sender, sendResponse) => {
    switch (msg.type) {
      case 'PING': {
        // ISOLATED 侧应答；若要求探测 MAIN，由 SW 用 executeScript world:MAIN 完成。
        const pong: PongMsg = { type: 'PONG', from: 'content', requestId: msg.requestId };
        sendResponse(pong);
        return; // 同步应答
      }
      case 'START_PICKER': {
        // 先回执「已就绪」证明 SP→SW→CS 通路；真正的采集结果经 ELEMENT_PICKED 单独广播。
        sendResponse({ ok: true, started: true });
        cancelActivePicker();
        activePicker = startElementPicker(
          (el) => {
            activePicker = null;
            const context = collectPageContext(el);
            const picked: ElementPickedMsg = { type: 'ELEMENT_PICKED', requestId: makeRequestId(), context };
            void chrome.runtime.sendMessage(picked);
          },
          () => {
            activePicker = null;
            // 页面内 Esc 退出，广播让侧栏同步状态（侧栏按钮取消走 CANCEL_PICKER，这里是反向路径）。
            const cancelled: PickCancelledMsg = { type: 'PICK_CANCELLED', requestId: makeRequestId() };
            void chrome.runtime.sendMessage(cancelled);
          },
        );
        return;
      }
      case 'CANCEL_PICKER': {
        // 侧栏「取消选择」按钮：之前只改侧栏自身状态，页面里的高亮/点击拦截其实还在跑，这里补上真正停止。
        sendResponse({ ok: true });
        cancelActivePicker();
        return;
      }
      case 'SHOW_TOAST': {
        if (msg.type !== 'SHOW_TOAST') return;
        showResultToast(msg.text);
        sendResponse({ ok: true });
        return;
      }
      case 'INJECT_VIA_SCRIPT_TAG': {
        // Method 2/3 降级注入：真正的执行与结果回传发生在页面 MAIN world，经 event-bridge 的
        // CustomEvent 单向回传后在这里 resolve，再把结果转成统一响应返回给 SW。
        runViaScriptTag(msg.method, msg.code, msg.gmGrants, msg.storageSnapshot)
          .then((payload) => sendResponse({ ok: true, data: payload }))
          .catch((e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            sendResponse({ ok: false, error: makeError(ErrorLayer.INJECT, 'SCRIPT_TAG_FAILED', message, [{ type: 'DISMISS' }]).serialize() });
          });
        return true;
      }
      case 'ELEMENT_PICKED':
      case 'PICK_CANCELLED':
        return; // 由本上下文广播出去，Chrome 消息机制不会回环给发送者自身，这里仅避免跌入 default
      default:
        return; // 未处理的消息不回信（避免 message port 提前关闭警告）
    }
  });

  console.log('[luban content] ready in', location.href);
}

boot();
