// 元素选择器悬停提示浮层（§3.2）。Phase 6 会扩展出运行结果 Toast，这里先实现选择态的 tag/id/class 提示。

const TOOLTIP_ID = '__luban_picker_tooltip';

function ensureTooltip(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement('div');
  el.id = TOOLTIP_ID;
  el.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;background:#1f2937;color:#fff;' +
    'font:12px/1.4 -apple-system,sans-serif;padding:2px 6px;border-radius:4px;white-space:nowrap;';
  document.documentElement.appendChild(el);
  return el;
}

/** 在光标附近显示元素摘要（tag/id/class）。 */
export function showElementTooltip(el: Element, x: number, y: number): void {
  const tip = ensureTooltip();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : '';
  tip.textContent = `${el.tagName.toLowerCase()}${id}${cls}`;
  tip.style.left = `${x + 12}px`;
  tip.style.top = `${y + 12}px`;
  tip.style.display = 'block';
}

export function hideElementTooltip(): void {
  const el = document.getElementById(TOOLTIP_ID);
  if (el) el.style.display = 'none';
}

export function removeElementTooltip(): void {
  document.getElementById(TOOLTIP_ID)?.remove();
}

const RESULT_TOAST_ID = '__luban_result_toast';

/** 页面右下角结果提示，5 秒后消失；点击后聚焦侧栏。 */
export function showResultToast(text: string): void {
  let el = document.getElementById(RESULT_TOAST_ID) as HTMLButtonElement | null;
  if (!el) {
    el = document.createElement('button');
    el.id = RESULT_TOAST_ID;
    el.type = 'button';
    el.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1f2937;color:#fff;' +
      'font:13px/1.4 -apple-system,sans-serif;padding:10px 14px;border:none;border-radius:8px;' +
      'cursor:pointer;max-width:280px;text-align:left;';
    el.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: 'FOCUS_PANEL', requestId: String(Date.now()) });
      el?.remove();
    });
    document.documentElement.appendChild(el);
  }
  el.textContent = text;
  const current = text;
  window.setTimeout(() => {
    if (el?.textContent === current) el.remove();
  }, 5000);
}
