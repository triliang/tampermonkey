// 选择器候选链生成（§3.2）：#id → 稳定 [data-*] → 稳定 .class → tag.class → nth-child 兜底。
// 每个候选都经 querySelectorAll 验证在当前文档内唯一，保证 AI 侧拿到的选择器可直接复用。

import { CONTEXT_LIMITS } from '../shared/constants';

/** 动态生成的 CSS-in-JS / 构建期哈希类名前缀，不具跨会话稳定性，必须排除。 */
const DYNAMIC_CLASS_PATTERN = /^(css|jsx|sc|emotion|styled|chakra|mui|ng)-/i;
/** 纯哈希类名（如 a1b2c3、_x8f2）。 */
const HASH_CLASS_PATTERN = /^_?[a-z]{0,2}[0-9a-f]{4,}$/i;

function isStableClass(cls: string): boolean {
  if (!cls) return false;
  if (DYNAMIC_CLASS_PATTERN.test(cls)) return false;
  if (HASH_CLASS_PATTERN.test(cls)) return false;
  return true;
}

/** 候选选择器在当前文档内是否唯一指向该元素。 */
function isUniqueMatch(selector: string, el: Element): boolean {
  try {
    const found = el.ownerDocument.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false; // 非法选择器语法（如值含特殊字符未转义）
  }
}

function escapeIdent(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function stableAttrCandidate(el: Element): string | null {
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith('data-')) continue;
    const sel = `[${attr.name}="${escapeIdent(attr.value)}"]`;
    if (isUniqueMatch(sel, el)) return sel;
  }
  return null;
}

function stableClassCandidate(el: Element): string | null {
  const stable = Array.from(el.classList).filter(isStableClass);
  if (stable.length === 0) return null;
  const sel = '.' + stable.map(escapeIdent).join('.');
  return isUniqueMatch(sel, el) ? sel : null;
}

function tagClassCandidate(el: Element): string | null {
  const stable = Array.from(el.classList).filter(isStableClass);
  const tag = el.tagName.toLowerCase();
  if (stable.length === 0) return null;
  const sel = `${tag}.${stable.map(escapeIdent).join('.')}`;
  return isUniqueMatch(sel, el) ? sel : null;
}

/** nth-child 兜底：从元素向上拼接到唯一为止，受 maxDepth 限制避免过深。 */
function nthChildCandidate(el: Element): string | null {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < CONTEXT_LIMITS.maxDepth) {
    const parentEl: Element | null = node.parentElement;
    if (!parentEl) {
      parts.unshift(node.tagName.toLowerCase());
      break;
    }
    const index = Array.from(parentEl.children).indexOf(node) + 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
    const candidate = parts.join(' > ');
    if (isUniqueMatch(candidate, el)) return candidate;
    node = parentEl;
    depth += 1;
  }
  const full = parts.join(' > ');
  return isUniqueMatch(full, el) ? full : null;
}

/**
 * 生成按稳健度降序的选择器候选链（最多 `CONTEXT_LIMITS.selectorCandidatesPerElement` 个）。
 * 每个候选均已验证在当前文档唯一指向 `el`。
 */
export function generateSelectors(el: Element): string[] {
  const candidates: string[] = [];

  if (el.id) {
    const idSel = `#${escapeIdent(el.id)}`;
    if (isUniqueMatch(idSel, el)) candidates.push(idSel);
  }

  const dataAttr = stableAttrCandidate(el);
  if (dataAttr) candidates.push(dataAttr);

  const stableClass = stableClassCandidate(el);
  if (stableClass) candidates.push(stableClass);

  const tagClass = tagClassCandidate(el);
  if (tagClass && !candidates.includes(tagClass)) candidates.push(tagClass);

  if (candidates.length === 0) {
    const fallback = nthChildCandidate(el);
    if (fallback) candidates.push(fallback);
  }

  return candidates.slice(0, CONTEXT_LIMITS.selectorCandidatesPerElement);
}
