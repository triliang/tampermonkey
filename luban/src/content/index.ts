import {TargetRegistry} from './annotations/registry';
import {showCodePreview,dismissCodePreview} from './code-preview';
import {clearRangePreview,previewRange,ownElement} from './target-context';
// Content Script（ISOLATED world，按需注入）。
// 幂等：SW 可能对同一标签页多次 executeScript，用 window 标记守卫，避免重复注册监听。
// Phase 1 仅实现链路自检（PING/ECHO）与 START_PICKER 回执；采集/桥接随 Phase 2/5 落地。

import type { ElementPickedMsg, LubanMessage, PickCancelledMsg, PongMsg } from '../shared/messages';
import { makeRequestId } from '../shared/messages';
import { collectPageContext } from './context-engine';
import { createPickerSession } from './picker-session';
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

  const pickerSession = createPickerSession();
  const targets = new TargetRegistry();

  chrome.runtime.onMessage.addListener((msg: LubanMessage, _sender, sendResponse) => {
    if((msg as {type:string}).type==='V4_TARGETS'){
      try {const raw=msg as unknown as {action:string;ids?:string[];excluded?:string[];color?:string;offset?:number};
        if(raw.action==='scan')sendResponse({ok:true,data:targets.scan(raw.offset)});
        else if(raw.action==='show')sendResponse({ok:true,data:targets.show(raw.ids??[],raw.excluded??[],raw.color)});
        else if(raw.action==='check')sendResponse({ok:true,data:targets.check(raw.ids??[],raw.color??'hide')});
        else if(raw.action==='prepare')sendResponse({ok:true,data:targets.prepare(raw.ids??[])});
        else if(raw.action==='resolve')sendResponse({ok:true,data:targets.resolve(raw.ids??[])});
        else if(raw.action==='clear'){targets.clear();sendResponse({ok:true});}
        else if(raw.action==='locate'){targets.locate(raw.ids?.[0]??'');sendResponse({ok:true});}
        else if(raw.action==='manual'){pickerSession.cancel();pickerSession.start(el=>{try{sendResponse({ok:true,data:targets.manual(el,raw.ids??[])});}catch(e){sendResponse({ok:false,error:String(e)});}},()=>sendResponse({ok:false,error:'已取消点选'}));return true;}
        else sendResponse({ok:false,error:'INVALID_TARGET_ACTION'});
      }catch(e){sendResponse({ok:false,error:String(e)});}return;
    }
    switch (msg.type) {
      case 'RENDER_CODE_PREVIEW':{void showCodePreview(msg.snapshot).then(sendResponse).catch(e=>sendResponse({ok:false,error:String(e)}));return true;}
      case 'DISMISS_CODE_PREVIEW':{sendResponse(dismissCodePreview(msg.sessionId));return;}

      case 'V21_CLEAR_PREVIEW':{clearRangePreview();sendResponse({ok:true});return;}
      case 'V21_PREVIEW_TARGET':{try{previewRange(msg.selectors,msg.fingerprint);sendResponse({ok:true});}catch(e){sendResponse({ok:false,error:String(e)});}return;}
      case 'PING': {
        // ISOLATED 侧应答；若要求探测 MAIN，由 SW 用 executeScript world:MAIN 完成。
        const pong: PongMsg = { type: 'PONG', from: 'content', requestId: msg.requestId };
        sendResponse(pong);
        return; // 同步应答
      }
      case 'START_PICKER': {
        // 先回执「已就绪」证明 SP→SW→CS 通路；真正的采集结果经 ELEMENT_PICKED 单独广播。
        sendResponse({ ok: true, started: true });
        pickerSession.cancel();
        pickerSession.start(
          (el) => {
            const context = collectPageContext(el);
            const picked: ElementPickedMsg = { type: 'ELEMENT_PICKED', requestId: msg.requestId, context };
            void chrome.runtime.sendMessage(picked);
          },
          () => {
            const cancelled: PickCancelledMsg = { type: 'PICK_CANCELLED', requestId: makeRequestId() };
            void chrome.runtime.sendMessage(cancelled);
          },
        );
        return;
      }
      case 'P2_CAPTURE': {
        let target: Element | null = null;
        try {
          for (const selector of msg.selectors ?? []) { try { const all=document.querySelectorAll(selector);target=all.length===1&&!ownElement(all[0])?all[0]:null; } catch { /* 下个候选 */ } if (target) break; }
          if (msg.selectors?.length && !target) throw Error('选中的元素已变化，请重新点选。');
          const context = target ? collectPageContext(target) : collectPageContext();
          void chrome.runtime.sendMessage({ type: 'CAPTURE_REPORT', requestId: msg.requestId, context })
            .then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
        } catch (e) { sendResponse({ ok: false, error: String(e) }); }
        return true;
      }
      case 'COLLECT_PAGE_CONTEXT': {
        sendResponse({ context: collectPageContext() });
        return;
      }
      case 'CANCEL_PICKER': {
        sendResponse({ ok: true });
        pickerSession.cancel();
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

  document.addEventListener('keydown',e=>{if(e.key==='Escape')clearRangePreview();});
  window.addEventListener('scroll',clearRangePreview,{passive:true});window.addEventListener('resize',clearRangePreview);
  console.log('[luban content] ready in', location.href);
}

boot();
