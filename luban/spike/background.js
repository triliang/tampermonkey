/*
 * 鲁班 Luban · Phase 0 注入验证 Spike —— Service Worker（后台编排）
 * ------------------------------------------------------------------
 * 职责：
 *   1. 点击图标（action.onClicked）在当前标签页执行注入，方法由侧栏开关决定。
 *   2. Method 1：chrome.scripting.executeScript({world:'MAIN'})  —— 浏览器级注入，绕过页面 CSP。
 *   3. Method 2/3：注入 content.js（ISOLATED world），由其创建 <script> 标签（textContent / Blob URL）
 *      落到页面 MAIN world，受页面 CSP script-src 约束；捕获 securitypolicyviolation 报错形态。
 *   4. 计时（executeScript 前后 performance.now 差）、best-effort 抓取 CSP 响应头、结构化落库。
 *   5. 任何异常均被 catch，绝不让 SW 崩溃（P0-T1 验收 ④）。
 *
 * 注意：本文件是 throwaway PoC，与正式 src/ 隔离；验证完成后归档。
 */

'use strict';

/* ======================================================================
 * 常量与存储 key
 * ==================================================================== */
const STORE_METHOD = 'luban:spike:method';   // 1 | 2 | 3 | 'auto'
const STORE_RESULTS = 'luban:spike:results'; // 最近 N 条注入记录（数组）
const STORE_LAST = 'luban:spike:last';       // 最近一条记录
const MAX_RESULTS = 50;
const MAIN_WAIT_MS = 800;                    // Method 2/3 等待 MAIN world 回执上限

/* ======================================================================
 * 顶层同步注册（MV3 强制）：所有事件监听器必须在 SW 顶层同步注册
 * ==================================================================== */

// 点击图标不自动开面板，改由我们手动 open，以保证 action.onClicked 一定触发注入。
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((e) => console.warn('[luban-spike] setPanelBehavior failed:', e));

chrome.action.onClicked.addListener((tab) => {
  // 先在用户手势上下文内打开面板（sidePanel.open 需要 user gesture，await 后会失效）。
  try {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  } catch (_) {
    /* 某些页面（如 chrome://）可能拒绝，忽略 */
  }
  handleActionClick(tab).catch((e) => console.error('[luban-spike] action handler crashed:', e));
});

// 侧栏控制面板 <-> SW 的消息通道
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case 'GET_STATE': {
          const { method, results, last } = await readState();
          sendResponse({ ok: true, method, results, last });
          break;
        }
        case 'SET_METHOD': {
          await chrome.storage.local.set({ [STORE_METHOD]: normalizeMethod(msg.method) });
          sendResponse({ ok: true, method: normalizeMethod(msg.method) });
          break;
        }
        case 'RUN_NOW': {
          // 便捷入口：面板触发注入。依赖此前点击图标已授予的 activeTab（导航后失效）。
          const raw = await getActiveTab();
          if (!raw) {
            sendResponse({ ok: false, error: '未找到活动标签页' });
            break;
          }
          const tab = await resolveTab(raw);
          const record = await runAndStore(tab, normalizeMethod(msg.method));
          sendResponse({ ok: true, record });
          break;
        }
        case 'CLEAR_RESULTS': {
          await chrome.storage.local.set({ [STORE_RESULTS]: [], [STORE_LAST]: null });
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'UNKNOWN_MSG' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // 异步 sendResponse
});

/* ======================================================================
 * 主流程
 * ==================================================================== */

async function handleActionClick(rawTab) {
  // onClicked 回调里的 tab 在 activeTab 授权生效前/受限页面下可能不含 url。
  // 授权在用户手势时已应用，这里重新 tabs.get 拿到带 url 的最新 tab。
  const tab = await resolveTab(rawTab);
  const method = await getCurrentMethod();
  const record = await runAndStore(tab, method);

  // 失败时在页面右下角弹 toast（chrome:// 等不可注入页面，toast 注入自身也会失败并被吞掉，
  // 此时错误已在侧栏与 SW console 呈现，SW 不崩）。P0-T1 验收 ④。
  if (!record.ok) {
    await showToast(
      tab,
      `鲁班 Spike · ${labelOfMethod(record.finalMethod || method)} 注入失败：${shorten(
        record.error || (record.violation && record.violation.violatedDirective) || '未获得执行回执',
        120
      )}`
    );
  } else {
    await showToast(
      tab,
      `鲁班 Spike · ${labelOfMethod(record.finalMethod || method)} 注入成功（${record.timingMs}ms）`
    );
  }
}

/**
 * 按 method 执行一次注入并落库；method === 'auto' 时依次尝试 1→2→3。
 */
async function runAndStore(tab, method) {
  let record;
  if (method === 'auto') {
    record = await runChain(tab);
  } else {
    record = await runMethod(tab, method);
  }
  await persist(record);
  return record;
}

/**
 * 降级链：Method 1 → 2 → 3，命中即停；记录每一步结果。
 * 对应技术设计 §3.5 降级链表。
 */
async function runChain(tab) {
  const steps = [];
  const t0 = performance.now();
  let succeeded = null;
  for (const m of [1, 2, 3]) {
    const r = await runMethod(tab, m, { skipCspFetch: true });
    steps.push({
      method: m,
      ok: r.ok,
      timingMs: r.timingMs,
      error: r.error || null,
      violatedDirective: (r.violation && r.violation.violatedDirective) || null,
    });
    if (r.ok && !succeeded) {
      succeeded = { method: m, record: r };
      break; // 命中即停，不再尝试更低优先级
    }
  }
  const totalMs = +(performance.now() - t0).toFixed(2);
  const csp = await fetchCspHeader(tab.url);
  return {
    ok: !!succeeded,
    mode: 'auto',
    id: 'auto-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    finalMethod: succeeded ? succeeded.method : 4, // 4 = 全部失败 →「暂不支持」
    url: tab.url,
    title: tab.title,
    totalMs,
    steps,
    csp,
    violation: succeeded ? null : lastViolation(steps),
    error: succeeded ? null : '降级链全部失败（Method 1/2/3 均未获得执行回执）',
    ts: Date.now(),
  };
}

function lastViolation(steps) {
  const found = steps.find((s) => s.violatedDirective);
  return found ? { violatedDirective: found.violatedDirective } : null;
}

/**
 * 执行单一方法的注入，返回结构化记录。
 * @param {chrome.tabs.Tab} tab
 * @param {1|2|3} method
 * @param {{skipCspFetch?:boolean}} [opts]
 */
async function runMethod(tab, method, opts = {}) {
  const tabId = tab.id;
  const url = tab.url || '';
  const nonce = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  const record = {
    ok: false,
    mode: 'single',
    id: nonce,
    method,
    finalMethod: method,
    url,
    title: tab.title,
    nonce,
    ts: Date.now(),
    timingMs: null,
    main: null,      // Method 1 的 MAIN world 返回值
    isolated: null,  // Method 2/3 的 ISOLATED 回执
    violation: null, // securitypolicyviolation 详情
    error: null,
  };

  // chrome:// / edge:// / Web Store 等受限页面：executeScript 必抛，直接走错误路径。
  // 仅在 url 已知且明确受限（chrome:// / Web Store 等）时提前拦截；
  // url 为空（授权未暴露 url）时不提前拦截，直接尝试注入——受限页面会由 executeScript 抛错并被 catch，
  // 避免把普通页面误判为不可注入。
  if (url && !isInjectable(url)) {
    record.error = `不可注入的页面（${shorten(url, 60)}）：浏览器禁止扩展在此注入脚本`;
    record.csp = opts.skipCspFetch ? null : await fetchCspHeader(url);
    return record;
  }

  const t0 = performance.now();
  try {
    if (method === 1) {
      // Method 1：浏览器级 MAIN world 注入，func 返回值直接序列化回 SW。
      const injected = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: __lubanMainProbe,
        args: [method, nonce],
      });
      record.timingMs = +(performance.now() - t0).toFixed(2);
      const res = injected && injected[0] && injected[0].result;
      record.main = res || null;
      record.ok = !!(res && res.ok && res.marker === true);
      if (!record.ok && !record.error) record.error = 'MAIN world 未返回成功标记';
    } else {
      // Method 2/3：先幂等注入 content.js（ISOLATED），再调用其暴露的注入器。
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      const injected = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'ISOLATED',
        func: (m, n, waitMs) => window.__lubanSpikeInject(m, n, waitMs),
        args: [method, nonce, MAIN_WAIT_MS],
      });
      record.timingMs = +(performance.now() - t0).toFixed(2);
      const res = injected && injected[0] && injected[0].result;
      record.isolated = res || null;
      record.violation = (res && res.violation) || null;
      record.ok = !!(res && res.ok);
      if (!record.ok) {
        record.error =
          (res && res.reason === 'timeout' && '等待 MAIN world 回执超时（脚本很可能被 CSP 拦截）') ||
          (res && res.error) ||
          'ISOLATED 注入器未返回成功回执';
      }
    }
  } catch (e) {
    record.timingMs = +(performance.now() - t0).toFixed(2);
    record.ok = false;
    record.error = String((e && e.message) || e);
    // 权限类报错几乎都是「用面板按钮触发、未获得 activeTab」所致。
    if (/Cannot access contents|must request permission|permission to access|activeTab/i.test(record.error)) {
      record.error += '（提示：面板「在此页运行」不授予 activeTab，请改为点击浏览器工具栏的扩展图标触发注入）';
    }
  }

  if (!opts.skipCspFetch) record.csp = await fetchCspHeader(url);
  return record;
}

/* ======================================================================
 * 注入到页面的函数（必须自包含：executeScript 会 toString 序列化，不能引用外部闭包变量）
 * ==================================================================== */

/**
 * Method 1 探针：运行于页面 MAIN world。
 * 硬编码「所有 <a> 标红」样式 + 打 __luban_poc 标记（P0-T1 验收 ②③）。
 */
function __lubanMainProbe(method, nonce) {
  try {
    // 幂等：清理上一次 PoC 样式，避免重复注入堆叠。
    const olds = document.querySelectorAll('style[data-luban-poc]');
    for (const o of olds) o.remove();

    const style = document.createElement('style');
    style.setAttribute('data-luban-poc', '1');
    style.textContent = 'a{color:#e02020 !important;}';
    (document.head || document.documentElement).appendChild(style);

    // 关键标记：在页面主上下文执行 __luban_poc 应输出 true（证明运行于 MAIN world）。
    window.__luban_poc = true;
    window.__luban_poc_method = method;
    document.documentElement.setAttribute('data-luban-poc-done', String(nonce));

    return {
      ok: true,
      method: method,
      marker: window.__luban_poc === true,
      world: 'MAIN',
      title: document.title,
      url: location.href,
      ts: Date.now(),
      perf: performance.now(),
    };
  } catch (e) {
    return { ok: false, method: method, error: String((e && e.message) || e) };
  }
}

/**
 * 失败/成功提示 toast：运行于 ISOLATED world（executeScript 注入，不受页面 CSP 限制）。
 * 在 chrome:// 等页面注入本函数会抛错，由调用方 catch 吞掉。
 */
function __lubanToast(message) {
  try {
    const old = document.getElementById('__luban_spike_toast');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = '__luban_spike_toast';
    box.textContent = message;
    box.setAttribute(
      'style',
      [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'max-width:340px',
        'padding:10px 14px',
        'border-radius:10px',
        'background:rgba(30,30,30,.94)',
        'color:#fff',
        'font:13px/1.5 -apple-system,system-ui,"PingFang SC",sans-serif',
        'box-shadow:0 6px 20px rgba(0,0,0,.35)',
        'white-space:pre-wrap',
        'word-break:break-word',
      ].join(';')
    );
    (document.body || document.documentElement).appendChild(box);
    setTimeout(() => box.remove(), 5000);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function showToast(tab, message) {
  if (!tab || !isInjectable(tab.url || '')) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',
      func: __lubanToast,
      args: [message],
    });
  } catch (e) {
    console.warn('[luban-spike] toast inject failed (expected on restricted pages):', e.message);
  }
}

/* ======================================================================
 * CSP 响应头抓取（best-effort）
 * activeTab 授权后，SW 可对当前标签页源发起跨源 fetch 并读取响应头。
 * ==================================================================== */
async function fetchCspHeader(url) {
  if (!/^https?:/i.test(url || '')) return { skipped: 'non-http(s) page' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'follow' });
    const csp = res.headers.get('content-security-policy');
    const cspRO = res.headers.get('content-security-policy-report-only');
    return {
      status: res.status,
      csp: csp || null,
      cspReportOnly: cspRO || null,
      // 摘要：只保留 script-src / default-src 相关片段，便于填表。
      summary: summarizeCsp(csp || cspRO || ''),
    };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

function summarizeCsp(policy) {
  if (!policy) return null;
  const parts = policy.split(';').map((s) => s.trim()).filter(Boolean);
  const keep = parts.filter((p) => /^(script-src|default-src|script-src-elem|script-src-attr)\b/i.test(p));
  const text = (keep.length ? keep : parts).join(' | ');
  return shorten(text, 200);
}

/* ======================================================================
 * 存储 / 工具
 * ==================================================================== */
async function persist(record) {
  try {
    const cur = (await chrome.storage.local.get(STORE_RESULTS))[STORE_RESULTS] || [];
    const next = [record, ...cur].slice(0, MAX_RESULTS);
    await chrome.storage.local.set({ [STORE_RESULTS]: next, [STORE_LAST]: record });
    notifyPanel({ type: 'SPIKE_RESULT', record });
  } catch (e) {
    console.error('[luban-spike] persist failed:', e);
  }
  return record;
}

function notifyPanel(payload) {
  // 面板未打开时 sendMessage 会抛「Receiving end does not exist」，吞掉即可。
  try {
    chrome.runtime.sendMessage(payload).catch(() => {});
  } catch (_) {
    /* ignore */
  }
}

async function readState() {
  const data = await chrome.storage.local.get([STORE_METHOD, STORE_RESULTS, STORE_LAST]);
  return {
    method: normalizeMethod(data[STORE_METHOD]),
    results: data[STORE_RESULTS] || [],
    last: data[STORE_LAST] || null,
  };
}

async function getCurrentMethod() {
  const data = await chrome.storage.local.get(STORE_METHOD);
  return normalizeMethod(data[STORE_METHOD]);
}

function normalizeMethod(m) {
  if (m === 'auto') return 'auto';
  const n = Number(m);
  return n === 2 || n === 3 ? n : 1; // 默认 Method 1
}

function labelOfMethod(m) {
  return m === 1
    ? 'Method 1 (executeScript MAIN)'
    : m === 2
    ? 'Method 2 (<script> textContent)'
    : m === 3
    ? 'Method 3 (Blob URL <script src>)'
    : m === 'auto'
    ? 'Auto (1→2→3)'
    : 'Method 4 (暂不支持)';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/**
 * 重新读取标签页以拿到带 url/title 的最新 Tab。
 * MV3 中 tab.url 仅在扩展对该页有授权（tabs 权限 / host 权限 / 已生效的 activeTab）时才可见；
 * onClicked 回调自带的 tab 可能在授权生效前被快照（url 为空），故在授权后重新 tabs.get。
 * 受限页面（chrome:// 等）不授 activeTab，重新读取后 url 仍为空 → 走「不可注入」分支，符合预期。
 */
async function resolveTab(tab) {
  if (!tab || !tab.id) return tab;
  try {
    const fresh = await chrome.tabs.get(tab.id);
    return Object.assign({}, tab, fresh);
  } catch (e) {
    return tab;
  }
}

/** 浏览器禁止扩展注入的内部页面。 */
function isInjectable(url) {
  if (!url) return false;
  if (/^(chrome|edge|about|chrome-extension|devtools|view-source|file):/i.test(url)) {
    // file: 需用户在扩展详情开启「允许访问文件网址」；此处保守视为需显式开启，仍尝试注入，
    // 若失败由 executeScript 抛错并被 catch。为减少误判，file: 放行。
    return /^file:/i.test(url);
  }
  if (/^https:\/\/chrome\.google\.com\/webstore/i.test(url)) return false;
  return /^https?:/i.test(url);
}

function shorten(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}
