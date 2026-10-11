// 注入调度器（P5-T1）：按 P0-T4 定稿降级链依次尝试 Method 1 → 2 → 3 → 4，
// 并把每个站点（domain）的历史成功/失败方法持久化到 chrome.storage.local，避免每次都从头试一遍。
//
// 诚实边界：P0-T3/T4 的 10 站点 Spike 实测数据（docs/spike-injection-results.md）当时未实际跑完
// （全表仍是 ☐ 占位），本调度器按技术设计 §3.5 的默认降级链顺序实现，Method 1 是否真能在
// ≥8/10 真实站点成功，仍需本阶段真人实测环节补充验证（见 docs/phase5-verification.md）。

import { STORAGE_KEYS } from '../shared/constants';
import { compileRunnerSource } from '../shared/injected-runner';
import type { RunPayload } from '../shared/injected-runner';
import type { InjectionMethod, InjectionResult, SiteCompatibility } from '../shared/types';

const USER_SCRIPTS_REQUIRED = '请在扩展详情页打开「允许用户脚本」，重新加载扩展后再运行';

const SITE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const TAB_CLOSED_RETRY_MS = 100;
const DEGRADE_CHAIN: InjectionMethod[] = [1, 2, 3];

export interface RunViaContentFn {
  (tabId: number, method: 2 | 3, code: string, gmGrants: string[], storageSnapshot: Record<string, unknown>): Promise<{
    ok: boolean;
    timedOut: boolean;
    dirty: Record<string, unknown>;
    scriptError?: string;
  }>;
}

/**
 * 对一个标签页执行注入。domain 用于站点兼容性缓存；runViaContent 由调用方（SW）注入，
 * 封装「ensureContentInjected + tabs.sendMessage(INJECT_VIA_SCRIPT_TAG)」，使本模块不直接依赖
 * chrome.tabs/chrome.scripting 之外的 SW 专属辅助函数，便于单测用假实现替换。
 */
export async function injectScript(
  tabId: number,
  domain: string,
  code: string,
  gmGrants: string[],
  storageSnapshot: Record<string, unknown>,
  runViaContent: RunViaContentFn,
): Promise<InjectionResult> {
  const compat = await getSiteCompatibility(domain);
  const order = pickMethodOrder(compat);

  for (const method of order) {
    const attempt = async (): Promise<InjectionResult> => {
      const started = Date.now();
      const payload =
        method === 1
          ? await runMethod1(tabId, code, gmGrants, storageSnapshot)
          : await runViaContent(tabId, method as 2 | 3, code, gmGrants, storageSnapshot);
      return {
        ok: payload.ok,
        method,
        timingMs: Date.now() - started,
        scriptError: payload.timedOut ? '脚本未正常结束（10s 内未收到完成信号）' : payload.scriptError,
        dirty: payload.dirty,
      };
    };

    try {
      const result = await attempt();
      await saveSiteSuccess(domain, method);
      return result;
    } catch (e) {
      let message = e instanceof Error ? e.message : String(e);
      if (message.includes('允许用户脚本')) {
        return { ok: false, method: 4, timingMs: 0, error: message };
      }
      if (/tab was closed|No tab with id|cannot find context/i.test(message)) {
        await sleep(TAB_CLOSED_RETRY_MS);
        try {
          const result = await attempt();
          await saveSiteSuccess(domain, method);
          return result;
        } catch (e2) {
          message = e2 instanceof Error ? e2.message : String(e2);
        }
      }
      await saveSiteFailure(domain, method, message);
    }
  }

  return { ok: false, method: 4, timingMs: 0, error: '该站点暂不支持自动注入。' };
}

async function runMethod1(
  tabId: number,
  code: string,
  gmGrants: string[],
  storageSnapshot: Record<string, unknown>,
): Promise<RunPayload> {
  const userScripts = (chrome as unknown as { userScripts?: { execute?: (injection: unknown) => Promise<Array<{ result?: RunPayload; error?: string }>> } }).userScripts;
  if (!userScripts?.execute) throw new Error(USER_SCRIPTS_REQUIRED);
  const [injected] = await userScripts.execute({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    js: [{ code: compileRunnerSource(code, gmGrants, storageSnapshot) }],
  });
  if (injected?.error) throw new Error(injected.error);
  if (!injected?.result) throw new Error('注入未返回结果');
  return injected.result;
}

/** 已知方法在 7 天内失败过则跳过；若曾经成功过，优先放到队首复用。 */
function pickMethodOrder(compat: SiteCompatibility | null): InjectionMethod[] {
  if (!compat) return [...DEGRADE_CHAIN];
  const now = Date.now();
  const failedRecently = new Set(
    compat.failures.filter((f) => now - f.timestamp < SITE_RETRY_MS).map((f) => f.method),
  );
  let order = [...DEGRADE_CHAIN];
  if (compat.injectionMethod && order.includes(compat.injectionMethod) && !failedRecently.has(compat.injectionMethod)) {
    order = [compat.injectionMethod, ...order.filter((m) => m !== compat.injectionMethod)];
  }
  return order.filter((m) => !failedRecently.has(m));
}

export async function getSiteCompatibility(domain: string): Promise<SiteCompatibility | null> {
  const key = STORAGE_KEYS.site(domain);
  const stored = await chrome.storage.local.get(key);
  return (stored[key] as SiteCompatibility | undefined) ?? null;
}

async function saveSiteSuccess(domain: string, method: InjectionMethod): Promise<void> {
  const key = STORAGE_KEYS.site(domain);
  const prev = await getSiteCompatibility(domain);
  const record: SiteCompatibility = {
    domain,
    lastTested: Date.now(),
    injectionMethod: method,
    failures: prev?.failures ?? [],
  };
  await chrome.storage.local.set({ [key]: record });
}

async function saveSiteFailure(domain: string, method: InjectionMethod, error: string): Promise<void> {
  const key = STORAGE_KEYS.site(domain);
  const prev = await getSiteCompatibility(domain);
  const record: SiteCompatibility = {
    domain,
    lastTested: Date.now(),
    injectionMethod: prev?.injectionMethod ?? 4,
    failures: [...(prev?.failures ?? []), { method, error, timestamp: Date.now() }],
  };
  await chrome.storage.local.set({ [key]: record });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
