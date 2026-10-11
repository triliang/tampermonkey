import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileRunnerSource } from '../shared/injected-runner';
import { STORAGE_KEYS } from '../shared/constants';
import { getSiteCompatibility, injectScript } from './injection-dispatcher';

const SAMPLE_DARK_STYLE_CODE =
  'GM_addStyle("html, body { background-color: #1a1a1a !important; color: #e0e0e0 !important; }");';

function makeLocalStorage() {
  const data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => Object.assign(data, items)),
    _data: data,
  };
}

let local: ReturnType<typeof makeLocalStorage>;
let execute: ReturnType<typeof vi.fn>;

beforeEach(() => {
  local = makeLocalStorage();
  execute = vi.fn();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local },
    userScripts: { execute },
  };
});

describe('injectScript · 整页暗色样式脚本', () => {
  it('经 Method 1 注入暗色脚本时 userScripts.execute 使用 MAIN world 与 compileRunnerSource', async () => {
    execute.mockResolvedValue([{ result: { ok: true, timedOut: false, dirty: {} } }]);
    const gmGrants = ['GM_addStyle'];
    await injectScript(1, 'example.com', SAMPLE_DARK_STYLE_CODE, gmGrants, {}, vi.fn());
    expect(execute).toHaveBeenCalledWith({
      target: { tabId: 1 },
      world: 'MAIN',
      injectImmediately: true,
      js: [{ code: compileRunnerSource(SAMPLE_DARK_STYLE_CODE, gmGrants, {}) }],
    });
    expect(compileRunnerSource(SAMPLE_DARK_STYLE_CODE, gmGrants, {})).toContain('#1a1a1a');
  });
});

describe('injectScript · Method 1 成功路径', () => {
  it('Method 1 成功时直接返回，不降级，站点记录写入成功方法', async () => {
    execute.mockResolvedValue([{ result: { ok: true, timedOut: false, dirty: {} } }]);
    const runViaContent = vi.fn();
    const result = await injectScript(1, 'example.com', 'code', [], {}, runViaContent);
    expect(result.ok).toBe(true);
    expect(result.method).toBe(1);
    expect(runViaContent).not.toHaveBeenCalled();
    const compat = await getSiteCompatibility('example.com');
    expect(compat?.injectionMethod).toBe(1);
  });
});

describe('injectScript · 降级链', () => {
  it('Method 1 失败自动降级到 Method 2（CSP 测试页模拟）', async () => {
    execute.mockRejectedValue(new Error('CSP blocked'));
    const runViaContent = vi.fn().mockResolvedValue({ ok: true, timedOut: false, dirty: {} });
    const result = await injectScript(1, 'csp-strict.test', 'code', [], {}, runViaContent);
    expect(result.ok).toBe(true);
    expect(result.method).toBe(2);
    expect(runViaContent).toHaveBeenCalledWith(1, 2, 'code', [], {});
  });

  it('全部降级方法失败则返回 Method 4「暂不支持」，总尝试不超过 3 次', async () => {
    execute.mockRejectedValue(new Error('blocked'));
    const runViaContent = vi.fn().mockRejectedValue(new Error('blocked'));
    const result = await injectScript(1, 'strict.test', 'code', [], {}, runViaContent);
    expect(result.ok).toBe(false);
    expect(result.method).toBe(4);
    // Method 1 + Method 2 + Method 3 = 3 次（execute 记 1 次，runViaContent 记 2 次）
    expect(execute).toHaveBeenCalledTimes(1);
    expect(runViaContent).toHaveBeenCalledTimes(2);
  });
});

describe('injectScript · 站点兼容性缓存', () => {
  it('已知站点优先复用历史成功方法，跳过已证伪方法', async () => {
    await (globalThis as unknown as { chrome: typeof chrome }).chrome.storage.local.set({
      [STORAGE_KEYS.site('known.test')]: {
        domain: 'known.test',
        lastTested: Date.now(),
        injectionMethod: 2,
        failures: [{ method: 1, error: 'CSP', timestamp: Date.now() }],
      },
    });
    const runViaContent = vi.fn().mockResolvedValue({ ok: true, timedOut: false, dirty: {} });
    const result = await injectScript(1, 'known.test', 'code', [], {}, runViaContent);
    expect(result.method).toBe(2);
    expect(execute).not.toHaveBeenCalled(); // Method 1 7 天内已证伪，直接跳过
  });

  it('失败方法 7 天后重新纳入候选', async () => {
    await (globalThis as unknown as { chrome: typeof chrome }).chrome.storage.local.set({
      [STORAGE_KEYS.site('stale.test')]: {
        domain: 'stale.test',
        lastTested: Date.now() - 8 * 24 * 60 * 60 * 1000,
        injectionMethod: 2,
        failures: [{ method: 1, error: 'CSP', timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 }],
      },
    });
    execute.mockResolvedValue([{ result: { ok: true, timedOut: false, dirty: {} } }]);
    const runViaContent = vi.fn();
    const result = await injectScript(1, 'stale.test', 'code', [], {}, runViaContent);
    expect(result.method).toBe(1); // 失败记录已过期，Method 1 重新可用
  });
});

describe('injectScript · tab 关闭重试', () => {
  it('「tab was closed」100ms 内重试一次，重试成功则不再降级', async () => {
    execute
      .mockRejectedValueOnce(new Error('tab was closed'))
      .mockResolvedValueOnce([{ result: { ok: true, timedOut: false, dirty: {} } }]);
    const runViaContent = vi.fn();
    const result = await injectScript(1, 'flaky.test', 'code', [], {}, runViaContent);
    expect(result.ok).toBe(true);
    expect(result.method).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(runViaContent).not.toHaveBeenCalled();
  });
});

describe('injectScript · 运行时错误不阻断', () => {
  it('脚本抛错时 ok 仍为 true（注入机制成功），scriptError 携带详情', async () => {
    execute.mockResolvedValue([{ result: { ok: true, timedOut: false, dirty: {}, scriptError: 'TypeError: boom' } }]);
    const result = await injectScript(1, 'runtime-error.test', 'code', [], {}, vi.fn());
    expect(result.ok).toBe(true);
    expect(result.scriptError).toBe('TypeError: boom');
  });

  it('10s 无完成信号映射为「脚本未正常结束」提示', async () => {
    execute.mockResolvedValue([{ result: { ok: true, timedOut: true, dirty: {} } }]);
    const result = await injectScript(1, 'timeout.test', 'code', [], {}, vi.fn());
    expect(result.ok).toBe(true);
    expect(result.scriptError).toContain('未正常结束');
  });
});
