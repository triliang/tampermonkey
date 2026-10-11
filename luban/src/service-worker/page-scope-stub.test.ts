// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { PageContext } from '../shared/types';
import { lubanRunScript } from '../shared/injected-runner';
import { scanCode } from './safety-scanner';
import { generateWithFallback } from './prompt-builder';
import {
  PAGE_DARK_MODE_INTENT,
  PAGE_DARK_MODE_STUB_CODE,
  tryPageScopeStub,
} from './page-scope-stub';

function pageContext(): PageContext {
  return {
    scope: 'page',
    meta: { url: 'https://example.com/', title: 'Example', siteType: 'unknown' },
    target: null,
    domSummary: {
      counts: { inputs: 0, buttons: 0, forms: 0, links: 0, images: 0 },
      inputs: [],
      buttons: [],
      title: '',
      truncated: false,
    },
  };
}

describe('tryPageScopeStub', () => {
  it('整页且意图为「把页面改成暗色」时返回固定脚本', () => {
    const stub = tryPageScopeStub(pageContext(), PAGE_DARK_MODE_INTENT);
    expect(stub).not.toBeNull();
    expect(stub!.code).toBe(PAGE_DARK_MODE_STUB_CODE);
    expect(stub!.gmGrants).toEqual(['GM_addStyle']);
  });

  it('点选 scope 或意图不匹配时不走 stub', () => {
    expect(tryPageScopeStub(pageContext(), '标红价格')).toBeNull();
    expect(
      tryPageScopeStub(
        {
          ...pageContext(),
          scope: 'element',
          target: {
            selectorCandidates: ['#x'],
            tag: 'span',
            text: '',
            attributes: {},
            contextPath: '',
            siblings: [],
          },
        },
        PAGE_DARK_MODE_INTENT,
      ),
    ).toBeNull();
  });

  it('stub 经安全扫描可通过', () => {
    const stub = tryPageScopeStub(pageContext(), PAGE_DARK_MODE_INTENT)!;
    expect(scanCode(stub.code, stub.gmGrants).passed).toBe(true);
  });

  it('确认运行后暗色样式生效（走 GM_addStyle）', async () => {
    document.head.innerHTML = '';
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    const stub = tryPageScopeStub(pageContext(), PAGE_DARK_MODE_INTENT)!;
    const r = await lubanRunScript(stub.code, stub.gmGrants, {});
    expect(r.scriptError).toBeUndefined();
    expect(document.querySelectorAll('style[data-luban-script]').length).toBe(1);
  });
});

describe('generateWithFallback · 整页暗色 stub', () => {
  it('匹配 stub 时不调用模型', async () => {
    const caller = { generate: vi.fn() };
    const data = await generateWithFallback(
      caller,
      pageContext(),
      PAGE_DARK_MODE_INTENT,
      'flash',
      'pro',
      () => {},
    );
    expect(caller.generate).not.toHaveBeenCalled();
    expect(data.code).toBe(PAGE_DARK_MODE_STUB_CODE);
  });

  it('生成阶段不触发 userScripts.execute', async () => {
    const execute = vi.fn();
    (globalThis as unknown as { chrome: unknown }).chrome = { userScripts: { execute } };
    await generateWithFallback(callerStub(), pageContext(), PAGE_DARK_MODE_INTENT, 'f', 'p', () => {});
    expect(execute).not.toHaveBeenCalled();
  });
});

function callerStub() {
  return { generate: vi.fn().mockResolvedValue('{}') };
}
