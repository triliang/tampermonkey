// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageContext } from '../shared/types';
import { compileRunnerSource } from '../shared/injected-runner';
import { injectScript } from './injection-dispatcher';
import { generateWithFallback, parseAiResponse } from './prompt-builder';
import { scanCode } from './safety-scanner';

const PAGE_DARK_MODE_INTENT = '把页面改成暗色';

const DARK_MODE_GENERATION = {
  code: 'GM_addStyle("html, body { background-color: #1a1a1a !important; color: #e0e0e0 !important; }");',
  explanation: '为整页注入暗色背景与浅色文字样式。',
  selectors: [] as string[],
  gmGrants: ['GM_addStyle'],
  confidence: 0.92,
  warnings: [] as string[],
};

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

function mockDarkModeCaller() {
  return {
    generate: vi.fn().mockResolvedValue(JSON.stringify(DARK_MODE_GENERATION)),
  };
}

describe('整页暗色 · 模型路径', () => {
  it('page scope、target=null、暗色意图时解析 mock 模型 JSON', async () => {
    const caller = mockDarkModeCaller();
    const data = await generateWithFallback(
      caller,
      pageContext(),
      PAGE_DARK_MODE_INTENT,
      'flash',
      'pro',
      () => {},
    );
    expect(caller.generate).toHaveBeenCalledTimes(1);
    expect(data.code).toBe(DARK_MODE_GENERATION.code);
    expect(data.gmGrants).toEqual(['GM_addStyle']);
    const parsed = parseAiResponse(JSON.stringify(DARK_MODE_GENERATION));
    expect(parsed.ok).toBe(true);
  });

  it('mock 回复脚本可通过 scanCode', async () => {
    const data = await generateWithFallback(mockDarkModeCaller(), pageContext(), PAGE_DARK_MODE_INTENT, 'f', 'p', () => {});
    expect(scanCode(data.code, data.gmGrants).passed).toBe(true);
  });
});

describe('整页暗色 · 注入时机', () => {
  let execute: ReturnType<typeof vi.fn>;
  let local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; _data: Record<string, unknown> };

  beforeEach(() => {
    local = {
      _data: {},
      get: vi.fn(async (key: string) => ({ [key]: local._data[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(local._data, items)),
    };
    execute = vi.fn().mockResolvedValue([{ result: { ok: true, timedOut: false, dirty: {} } }]);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: { local },
      userScripts: { execute },
    };
  });

  it('生成完成不调用 userScripts.execute', async () => {
    await generateWithFallback(mockDarkModeCaller(), pageContext(), PAGE_DARK_MODE_INTENT, 'f', 'p', () => {});
    expect(execute).not.toHaveBeenCalled();
  });

  it('经 injectScript 确认运行才调用 userScripts.execute（MAIN world + 模型脚本）', async () => {
    const data = await generateWithFallback(mockDarkModeCaller(), pageContext(), PAGE_DARK_MODE_INTENT, 'f', 'p', () => {});
    await injectScript(1, 'example.com', data.code, data.gmGrants, {}, vi.fn());
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      target: { tabId: 1 },
      world: 'MAIN',
      injectImmediately: true,
      js: [{ code: compileRunnerSource(data.code, data.gmGrants, {}) }],
    });
  });
});
