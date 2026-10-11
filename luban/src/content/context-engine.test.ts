// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { captureTargetElement, sanitizeUrl, summarizeDom } from './context-engine';
import { CONTEXT_LIMITS } from '../shared/constants';

describe('sanitizeUrl 脱敏（§3.2 Phase 3）', () => {
  it('移除 token 参数', () => {
    expect(sanitizeUrl('https://a.com/?token=abc&x=1')).not.toContain('token');
  });
  it('移除 session 参数', () => {
    expect(sanitizeUrl('https://a.com/?session=xyz')).not.toContain('session');
  });
  it('移除 auth 参数', () => {
    expect(sanitizeUrl('https://a.com/?auth=1')).not.toContain('auth=');
  });
  it('移除 key 参数', () => {
    expect(sanitizeUrl('https://a.com/?key=secretvalue')).not.toContain('key=');
  });
  it('移除 secret 参数', () => {
    expect(sanitizeUrl('https://a.com/?secret=abc')).not.toContain('secret');
  });
  it('多个敏感参数同时移除，保留非敏感参数', () => {
    const out = sanitizeUrl('https://a.com/?token=a&session=b&page=2');
    expect(out).not.toContain('token');
    expect(out).not.toContain('session');
    expect(out).toContain('page=2');
  });
  it('非法 URL 原样返回，不抛异常', () => {
    expect(() => sanitizeUrl('not a url')).not.toThrow();
    expect(sanitizeUrl('not a url')).toBe('not a url');
  });
  it('password input 的 value 永不出现在采集结果中（本模块不采集任何 value 字段）', () => {
    document.body.innerHTML = '<input id="pw" type="password" value="s3cr3t" />';
    const el = document.getElementById('pw')!;
    const target = captureTargetElement(el);
    expect(JSON.stringify(target)).not.toContain('s3cr3t');
    expect(target.attributes.value).toBeUndefined();
  });
});

describe('summarizeDom 限流（§3.2 Phase 2）', () => {
  it(`超过 maxInputs(${CONTEXT_LIMITS.maxInputs}) 时 inputs 数组截断，counts 仍计全部`, () => {
    const n = CONTEXT_LIMITS.maxInputs + 5;
    document.body.innerHTML = Array.from({ length: n }, (_, i) => `<input id="i${i}" />`).join('');
    const summary = summarizeDom(document);
    expect(summary.counts.inputs).toBe(n);
    expect(summary.inputs.length).toBe(CONTEXT_LIMITS.maxInputs);
  });

  it(`超过 maxButtons(${CONTEXT_LIMITS.maxButtons}) 时 buttons 数组截断，counts 仍计全部`, () => {
    const n = CONTEXT_LIMITS.maxButtons + 3;
    document.body.innerHTML = Array.from({ length: n }, (_, i) => `<button>b${i}</button>`).join('');
    const summary = summarizeDom(document);
    expect(summary.counts.buttons).toBe(n);
    expect(summary.buttons.length).toBe(CONTEXT_LIMITS.maxButtons);
  });

  it(`超过 maxDepth(${CONTEXT_LIMITS.maxDepth}) 的子树被跳过，不计入 counts`, () => {
    let deep = '<button id="deepest">deep</button>';
    for (let i = 0; i < CONTEXT_LIMITS.maxDepth + 5; i++) deep = `<div>${deep}</div>`;
    document.body.innerHTML = `<button id="shallow">shallow</button>${deep}`;
    const summary = summarizeDom(document);
    // 浅层按钮计入，深层（超过 maxDepth）按钮所在子树被整体剪掉
    expect(summary.counts.buttons).toBe(1);
  });

  it('未超限时 truncated 为 false', () => {
    document.body.innerHTML = '<input /><button>x</button>';
    const summary = summarizeDom(document);
    expect(summary.truncated).toBe(false);
  });
});

describe('captureTargetElement', () => {
  it('采集 tag/text/选择器候选链/contextPath', () => {
    document.body.innerHTML = '<div id="wrap"><button id="buy">立即购买</button></div>';
    const el = document.getElementById('buy')!;
    const target = captureTargetElement(el);
    expect(target.tag).toBe('button');
    expect(target.text).toBe('立即购买');
    expect(target.selectorCandidates[0]).toBe('#buy');
    expect(target.contextPath).toContain('button#buy');
  });
});
