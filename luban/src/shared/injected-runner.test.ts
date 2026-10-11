// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { lubanRunScript } from './injected-runner';

describe('lubanRunScript · GM_getValue/setValue/deleteValue', () => {
  it('同步读取预注入快照', async () => {
    const r = await lubanRunScript(
      'if (GM_getValue("k") !== "v") throw new Error("mismatch");',
      ['GM_getValue'],
      { k: 'v' },
    );
    expect(r.ok).toBe(true);
    expect(r.scriptError).toBeUndefined();
  });

  it('setValue 产生 dirty 增量', async () => {
    const r = await lubanRunScript('GM_setValue("k", "new")', ['GM_getValue', 'GM_setValue'], {});
    expect(r.dirty).toEqual({ k: 'new' });
  });

  it('deleteValue 的 dirty 值为 null', async () => {
    const r = await lubanRunScript('GM_deleteValue("k")', ['GM_deleteValue'], { k: 'old' });
    expect(r.dirty).toEqual({ k: null });
  });

  it('未授权的 GM API 为 undefined', async () => {
    const r = await lubanRunScript(
      'if (typeof GM_setValue !== "undefined") throw new Error("should be undefined");',
      ['GM_getValue'],
      {},
    );
    expect(r.scriptError).toBeUndefined();
  });
});

describe('lubanRunScript · GM_addStyle 幂等', () => {
  it('连跑 3 次仅 1 个 style 节点', async () => {
    document.head.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      await lubanRunScript('GM_addStyle("body{color:red}")', ['GM_addStyle'], {});
    }
    expect(document.querySelectorAll('style[data-luban-script]').length).toBe(1);
  });
});

describe('lubanRunScript · unsafeWindow / GM_info', () => {
  it('unsafeWindow 即 window', async () => {
    const r = await lubanRunScript(
      'if (unsafeWindow !== window) throw new Error("not window");',
      ['unsafeWindow'],
      {},
    );
    expect(r.scriptError).toBeUndefined();
  });

  it('GM_info 返回元信息对象', async () => {
    const r = await lubanRunScript(
      'const info = GM_info(); if (!info.version) throw new Error("no version");',
      ['GM_info'],
      {},
    );
    expect(r.scriptError).toBeUndefined();
  });
});

describe('lubanRunScript · 错误捕获', () => {
  it('同步抛错时 ok 仍为 true，scriptError 携带 message', async () => {
    const r = await lubanRunScript('throw new Error("boom")', [], {});
    expect(r.ok).toBe(true);
    expect(r.scriptError).toContain('boom');
  });

  it('null.querySelector 抛 TypeError 时摘要含 message', async () => {
    const r = await lubanRunScript('null.querySelector(".x")', [], {});
    expect(r.scriptError).toMatch(/TypeError|null/i);
  });

  it('异步抛错同样被捕获', async () => {
    const r = await lubanRunScript('await Promise.resolve(); throw new Error("async-boom")', [], {});
    expect(r.scriptError).toContain('async-boom');
  });
});

describe('lubanRunScript · 不污染页面全局', () => {
  it('注入前后 window 快照 diff 仅新增 api 内部变量，不暴露到 window 上', async () => {
    const before = new Set(Object.keys(window));
    await lubanRunScript('document.title = document.title;', ['GM_getValue'], {});
    const after = new Set(Object.keys(window));
    expect(after.size).toBe(before.size);
  });
});

describe('lubanRunScript · 10s 无完成信号', () => {
  it('挂起的异步代码 10s 后标记 timedOut，不阻塞 resolve', async () => {
    vi.useFakeTimers();
    const promise = lubanRunScript('await new Promise(() => {});', [], {});
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await promise;
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(true);
    vi.useRealTimers();
  });
});
