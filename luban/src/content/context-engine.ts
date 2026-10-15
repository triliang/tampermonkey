import {captureTargetContext} from './target-context';
import { sanitizePageUrl } from '../shared/safe-url';
// 页面上下文引擎（§3.2）：Phase1 目标元素同步采集 → Phase2 TreeWalker 限流摘要 → Phase3 脱敏。
// 纯函数操作真实 DOM，不依赖 chrome.* API，可在 jsdom 下单测。

import type { DOMSummary, PageContext, TargetElement } from '../shared/types';
import { CONTEXT_LIMITS } from '../shared/constants';
import { generateSelectors } from './selector-generator';

const MAX_TEXT_LEN = 120;
const SUMMARY_DEADLINE_MS = 200;
/** 需同步采集的属性白名单（避免整份 attributes 泄漏业务无关标记）。 */
const CAPTURED_ATTRS = ['id', 'class', 'name', 'type', 'role', 'aria-label', 'placeholder', 'title', 'href'];

function truncateText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > MAX_TEXT_LEN ? trimmed.slice(0, MAX_TEXT_LEN) + '…' : trimmed;
}

function captureAttributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of CAPTURED_ATTRS) {
    const v = el.getAttribute(name);
    if (v) out[name] = name === 'href' ? sanitizePageUrl(v, location.href) : v;
  }
  return out;
}

function buildContextPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName.toLowerCase() !== 'html') {
    const tag = node.tagName.toLowerCase();
    parts.unshift(node.id ? `${tag}#${node.id}` : tag);
    node = node.parentElement;
  }
  return parts.join('>');
}

function siblingTags(el: Element): string[] {
  const parent = el.parentElement;
  if (!parent) return [];
  return Array.from(parent.children)
    .filter((c) => c !== el)
    .slice(0, 5)
    .map((c) => c.tagName.toLowerCase());
}

/** Phase 1（~3ms）：目标元素同步采集，含选择器候选链。 */
export function captureTargetElement(el: Element): TargetElement {
  return {
    targetContext:captureTargetContext(el),
    selectorCandidates: generateSelectors(el),
    tag: el.tagName.toLowerCase(),
    text: truncateText(el.textContent ?? ''),
    attributes: captureAttributes(el),
    contextPath: buildContextPath(el),
    siblings: siblingTags(el),
  };
}

/** Phase 2（~60ms，受 200ms 强制截断）：TreeWalker 限流摘要，深度/数量双限流。 */
export function summarizeDom(root: Document = document): DOMSummary {
  const counts = { inputs: 0, buttons: 0, forms: 0, links: 0, images: 0 };
  const inputs: string[] = [];
  const buttons: string[] = [];
  let truncated = false;
  const structure: NonNullable<DOMSummary['structure']> = [];
  const depthCache = new WeakMap<Node, number>();
  const start = performance.now();

  const walker = root.createTreeWalker(root.body ?? root.documentElement, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node: Node): number {
      const el = node as Element;
      const parent = el.parentElement;
      const depth = parent ? (depthCache.get(parent) ?? 0) + 1 : 0;
      depthCache.set(el, depth);
      return depth > CONTEXT_LIMITS.maxDepth ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  let visited = 0;
  let node: Node | null = walker.currentNode;
  while (node) {
    visited += 1;
    if (visited % 500 === 0 && performance.now() - start > SUMMARY_DEADLINE_MS) {
      truncated = true;
      break;
    }
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (structure.length < 30 && (['main', 'section', 'article', 'table', 'ul', 'ol', 'h1', 'h2', 'h3'].includes(tag) || ['main', 'navigation', 'list', 'table'].includes(el.getAttribute('role') ?? ''))) {
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll('script,style,input,textarea,select,[hidden]').forEach(node => node.remove());
      structure.push({ tag, selectors: generateSelectors(el).slice(0, 4), text: truncateText(clone.textContent ?? ''), role: el.getAttribute('role') ?? undefined });
    }
    switch (tag) {
      case 'input':
      case 'textarea':
      case 'select':
        counts.inputs += 1;
        if (inputs.length < CONTEXT_LIMITS.maxInputs) {
          inputs.push(`${tag}${el.getAttribute('type') ? `[${el.getAttribute('type')}]` : ''}${el.getAttribute('placeholder') ? `(${el.getAttribute('placeholder')})` : ''}`);
        } else {
          truncated = true;
        }
        break;
      case 'button':
        counts.buttons += 1;
        if (buttons.length < CONTEXT_LIMITS.maxButtons) {
          buttons.push(truncateText(el.textContent ?? '') || 'button');
        } else {
          truncated = true;
        }
        break;
      case 'form':
        counts.forms += 1;
        break;
      case 'a':
        counts.links += 1;
        break;
      case 'img':
        counts.images += 1;
        break;
      default:
        break;
    }
    node = walker.nextNode();
  }

  return { counts, inputs, buttons, title: root.title, truncated, structure };
}

/** Phase 3（~10ms）：脱敏——剔除敏感 URL 参数；password 值永不采集（本模块本身不采集任何 input value）。 */
export function sanitizeUrl(url: string): string { return sanitizePageUrl(url); }

function buildPageContextBase(): Pick<PageContext, 'meta' | 'domSummary'> {
  return {
    meta: { url: sanitizeUrl(location.href), title: document.title, siteType: 'unknown' },
    domSummary: summarizeDom(document),
  };
}

/** 点选元素后采集（scope=element）；无参调用为整页采集（scope=page，target=null）。 */
export function collectPageContext(el: Element): PageContext;
export function collectPageContext(): PageContext;
export function collectPageContext(el?: Element): PageContext {
  const base = buildPageContextBase();
  if (el) {
    return { ...base, scope: 'element', target: captureTargetElement(el) };
  }
  return { ...base, scope: 'page', target: null };
}
