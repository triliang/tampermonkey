/*
 * 鲁班 Luban · Phase 0 注入验证 Spike —— Content Script（ISOLATED world）
 * ------------------------------------------------------------------------
 * 由 background.js 通过 chrome.scripting.executeScript({files:['content.js']}) 按需注入。
 * 仅承载降级链的 Method 2 / Method 3：
 *   - Method 2：创建 <script> 标签，用 textContent 内联 PoC 代码 → 落页面 MAIN world，受 CSP script-src 约束。
 *   - Method 3：创建 Blob URL，用 <script src="blob:..."> 加载 → 受 CSP script-src blob: 约束。
 *
 * 成功判定：MAIN world 代码执行后 dispatch 一个带 nonce 的 CustomEvent（跨世界经共享 DOM 传递），
 *           ISOLATED 侧监听该事件；被 CSP 拦截时事件不会到达，并触发 securitypolicyviolation。
 * 幂等：重复注入只定义一次（window.__luban_cs_loaded 守卫）。
 */

(function () {
  'use strict';

  const ISOLATED = window; // content.js 运行于 ISOLATED world，此 window 非页面 window

  if (ISOLATED.__luban_cs_loaded) return;
  ISOLATED.__luban_cs_loaded = true;

  /**
   * 生成将在页面 MAIN world 执行的 PoC 代码字符串。
   * 与 background.js 的 __lubanMainProbe 行为一致：所有 <a> 标红 + 打 __luban_poc 标记，
   * 并通过 CustomEvent 向 ISOLATED 回执（跨世界共享 document 事件系统）。
   */
  function buildPayload(method, nonce, doneEvent, errEvent) {
    return (
      '(function(){' +
      'try{' +
      "var olds=document.querySelectorAll('style[data-luban-poc]');" +
      'for(var i=0;i<olds.length;i++){olds[i].remove();}' +
      "var st=document.createElement('style');" +
      "st.setAttribute('data-luban-poc','1');" +
      "st.textContent='a{color:#e02020 !important;}';" +
      '(document.head||document.documentElement).appendChild(st);' +
      'window.__luban_poc=true;' +
      'window.__luban_poc_method=' + JSON.stringify(method) + ';' +
      "document.documentElement.setAttribute('data-luban-poc-done'," + JSON.stringify(String(nonce)) + ');\n' +
      'document.dispatchEvent(new CustomEvent(' + JSON.stringify(doneEvent) + ',{detail:Date.now()}));' +
      '}catch(e){' +
      'document.dispatchEvent(new CustomEvent(' + JSON.stringify(errEvent) + ',{detail:String((e&&e.message)||e)}));' +
      '}' +
      '})();'
    );
  }

  /**
   * ISOLATED 侧注入器：被 background.js 通过 executeScript(func:(m,n,w)=>window.__lubanSpikeInject(m,n,w)) 调用。
   * @param {2|3} method
   * @param {string} nonce
   * @param {number} waitMs 等待 MAIN world 回执上限
   * @returns {Promise<object>} 结构化结果（含 violation / timing）
   */
  ISOLATED.__lubanSpikeInject = function (method, nonce, waitMs) {
    const doneEvent = '__luban_poc_done_' + nonce;
    const errEvent = '__luban_poc_error_' + nonce;
    const t0 = performance.now();

    let violation = null;
    const onViolation = (e) => {
      // 记录 CSP violation 报错形态（P0-T2 验收 ②③）。
      violation = {
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        effectiveDirective: e.effectiveDirective,
        originalPolicy: e.originalPolicy,
        disposition: e.disposition,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
        columnNumber: e.columnNumber,
      };
    };
    document.addEventListener('securitypolicyviolation', onViolation);

    return new Promise((resolve) => {
      let settled = false;
      let poll = null;
      const domMarked = () =>
        document.documentElement.getAttribute('data-luban-poc-done') === String(nonce);
      const finish = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('securitypolicyviolation', onViolation);
        if (poll) clearInterval(poll);
        resolve(Object.assign({ method, nonce, timingMs: +(performance.now() - t0).toFixed(2), violation }, result));
      };

      const deadline = t0 + (waitMs || 800);

      // 快速路径：跨世界 CustomEvent（多数环境可用）。
      document.addEventListener(doneEvent, () => finish({ ok: true, reason: 'main-done-event' }), { once: true });
      document.addEventListener(
        errEvent,
        (ev) => finish({ ok: false, reason: 'main-error', error: (ev && ev.detail) || 'unknown' }),
        { once: true }
      );

      // 稳健路径：轮询共享 DOM 上的标记属性。跨世界读属性一定可见，不依赖事件投递；
      // 若事件未送达但脚本确实执行了（属性已置），这里仍能判定成功，避免误报超时。
      poll = setInterval(() => {
        if (domMarked()) {
          finish({ ok: true, reason: 'main-dom-mark' });
        } else if (performance.now() >= deadline) {
          finish({ ok: false, reason: 'timeout', domMark: domMarked() });
        }
      }, 40);

      const payload = buildPayload(method, nonce, doneEvent, errEvent);
      try {
        if (method === 2) {
          // Method 2：内联 textContent。
          const s = document.createElement('script');
          s.setAttribute('data-luban-poc-inject', '2');
          s.textContent = payload;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
        } else if (method === 3) {
          // Method 3：Blob URL <script src>。
          const blob = new Blob([payload], { type: 'text/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          const s = document.createElement('script');
          s.setAttribute('data-luban-poc-inject', '3');
          s.src = blobUrl;
          const cleanup = () => setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          s.onload = cleanup;
          s.onerror = cleanup;
          (document.head || document.documentElement).appendChild(s);
        } else {
          finish({ ok: false, reason: 'bad-method', error: 'content.js 仅支持 Method 2/3' });
        }
      } catch (e) {
        finish({ ok: false, reason: 'inject-throw', error: String((e && e.message) || e) });
      }
    });
  };

  console.info('[luban-spike] content.js loaded (ISOLATED world), injector ready.');
})();
