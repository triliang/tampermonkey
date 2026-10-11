// 元素选择器（§3.2）：全屏透明覆盖层 + elementsFromPoint 穿透取真实元素。
//
// 为什么不直接在 document 上挂 capture 阶段 click/mouseover 监听器：
// 很多站点（尤其广告位）会在页面加载时就在 document/window 上注册自己的 capture 阶段监听器，
// 我们的 content script 是用户点击扩展图标之后才按需注入的，注册时机天然晚于站点脚本——
// 这场"谁先注册谁先执行"的竞速我们必输，曾在 CSDN 广告图上实测复现跳转未被拦截。
// 改用覆盖层后，鼠标事件的 hit-test 目标直接就是覆盖层本身，页面原生监听器根本收不到事件
// （不是跑得快慢的问题，是事件分发阶段就没有它们的份），和 DevTools 审查元素模式思路一致。
import { hideElementTooltip, removeElementTooltip, showElementTooltip } from './toast';

const HIGHLIGHT_CLASS = '__luban_picker_highlight';
const STYLE_ID = '__luban_picker_style';
const OVERLAY_ID = '__luban_picker_overlay';
const TOOLTIP_ID = '__luban_picker_tooltip';

function ensureHighlightStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.${HIGHLIGHT_CLASS}{outline:2px solid #2563eb !important;outline-offset:1px !important;}`;
  document.documentElement.appendChild(style);
}

function removeHighlightStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.tabIndex = -1;
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:transparent;';
  document.documentElement.appendChild(overlay);
  return overlay;
}

/** 穿透覆盖层/提示浮层自身节点，取光标下方页面的真实元素。 */
function resolveRealTarget(x: number, y: number, overlay: Element): Element | null {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (el === overlay || el.id === TOOLTIP_ID) continue;
    return el;
  }
  return null;
}

export interface PickerHandle {
  stop: () => void;
}

export function isElementPickerActive(): boolean {
  return document.getElementById(OVERLAY_ID) != null;
}

/**
 * 进入元素选择模式。`onPick` 在用户点击目标元素时触发；`onCancel` 在 Esc 退出时触发。
 * 返回的 `stop()` 可用于主动结束选择（幂等，可重复调用）。
 */
export function startElementPicker(onPick: (el: Element) => void, onCancel: () => void): PickerHandle {
  ensureHighlightStyle();
  const overlay = createOverlay();
  overlay.focus(); // 把键盘焦点从侧栏夺回页面，否则 Esc 永远传不到这里（真实复现过的 bug）
  let current: Element | null = null;
  let stopped = false;

  function clearHighlight(): void {
    current?.classList.remove(HIGHLIGHT_CLASS);
    current = null;
  }

  function onMouseMove(e: MouseEvent): void {
    const real = resolveRealTarget(e.clientX, e.clientY, overlay);
    if (!real) {
      clearHighlight();
      hideElementTooltip();
      return;
    }
    if (real !== current) {
      clearHighlight();
      current = real;
      current.classList.add(HIGHLIGHT_CLASS);
    }
    showElementTooltip(real, e.clientX, e.clientY);
  }

  function onClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const real = resolveRealTarget(e.clientX, e.clientY, overlay);
    stop();
    if (real) onPick(real);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      stop();
      onCancel();
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearHighlight();
    hideElementTooltip();
    removeElementTooltip();
    removeHighlightStyle();
    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('click', onClick);
    overlay.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  }

  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('click', onClick);
  overlay.addEventListener('keydown', onKeyDown);

  return { stop };
}
