/*
 * 鲁班 Luban · Phase 0 注入验证 Spike —— Side Panel 控制面板逻辑
 * ----------------------------------------------------------------
 * MV3 扩展页禁止内联脚本，事件全部用 addEventListener 绑定。
 * 与 background.js 通过 chrome.runtime 消息通信：
 *   GET_STATE / SET_METHOD / RUN_NOW / CLEAR_RESULTS；并监听 SW 推来的 SPIKE_RESULT。
 */

'use strict';

const $ = (sel) => document.querySelector(sel);
const resultsEl = $('#results');
let cache = { method: 1, results: [], last: null };

/* ------------------------- 初始化 ------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await refreshState();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'SPIKE_RESULT' && msg.record) {
    addRecord(msg.record);
  }
});

function bindEvents() {
  $('#save').addEventListener('click', async () => {
    const method = selectedMethod();
    const resp = await send({ type: 'SET_METHOD', method });
    if (resp && resp.ok) {
      cache.method = resp.method;
      flash($('#save'), '已保存 ✓');
    }
  });

  $('#run').addEventListener('click', async () => {
    const method = selectedMethod();
    const btn = $('#run');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '注入中…';
    const resp = await send({ type: 'RUN_NOW', method });
    btn.disabled = false;
    btn.textContent = old;
    if (resp && resp.ok && resp.record) {
      addRecord(resp.record);
    } else {
      const errText = ((resp && resp.error) || '未知错误') + '\n提示：请先点击工具栏扩展图标授予当前页权限。';
      panelToast('运行失败：' + errText, 'err');
    }
  });

  $('#clear').addEventListener('click', async () => {
    await send({ type: 'CLEAR_RESULTS' });
    cache.results = [];
    cache.last = null;
    render();
  });

  $('#copy').addEventListener('click', () => {
    copyText(cache.last ? JSON.stringify(cache.last, null, 2) : '');
    flash($('#copy'), '已复制 ✓');
  });

  $('#copyAll').addEventListener('click', () => {
    copyText(JSON.stringify(cache.results || [], null, 2));
    flash($('#copyAll'), '已复制 ✓');
  });
}

async function refreshState() {
  const resp = await send({ type: 'GET_STATE' });
  if (resp && resp.ok) {
    cache = { method: resp.method, results: resp.results || [], last: resp.last || null };
    const radio = document.querySelector(`input[name="method"][value="${String(cache.method)}"]`);
    if (radio) radio.checked = true;
  }
  render();
}

/* ------------------------- 渲染 ------------------------- */

/**
 * 新增一条记录并按 id 去重。
 * 说明：一次注入可能经两条路径回到面板——SW 广播的 SPIKE_RESULT 与 RUN_NOW 的 sendResponse，
 * 二者携带同一 record（同 id），去重避免重复展示。
 */
function addRecord(rec) {
  if (!rec) return;
  const list = cache.results || [];
  const id = rec.id || rec.nonce || rec.url + ':' + rec.ts;
  if (list.some((r) => (r.id || r.nonce || r.url + ':' + r.ts) === id)) {
    // 已由另一路径（广播/响应）展示并弹过 toast，此处仅同步 last，不重复弹窗。
    cache.last = rec;
    render();
    return;
  }
  cache.results = [rec, ...list].slice(0, 50);
  cache.last = rec;
  render();
  panelToastFor(rec);
}

/** 依据注入结果在侧栏弹一个短暂 toast（chrome:// 等不可注入页面时，这是唯一的用户可见提示）。 */
function panelToastFor(rec) {
  const m = rec.mode === 'auto' ? `Auto → M${rec.finalMethod}` : labelMethod(rec.method);
  if (rec.ok) panelToast(`${m} 注入成功（${rec.timingMs != null ? rec.timingMs : rec.totalMs} ms）`, 'ok');
  else panelToast(`${m} 注入失败：${rec.error || (rec.violation && rec.violation.violatedDirective) || '未获得执行回执'}`, 'err');
}

function panelToast(message, kind) {
  const old = document.getElementById('__panel_toast');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = '__panel_toast';
  box.textContent = message;
  const bg = kind === 'ok' ? 'rgba(34,197,94,.95)' : 'rgba(239,68,68,.95)';
  box.setAttribute(
    'style',
    `position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;padding:10px 12px;border-radius:8px;background:${bg};color:#fff;font-size:12.5px;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.35);white-space:pre-wrap;word-break:break-word;`
  );
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

function render() {
  const list = cache.results || [];
  resultsEl.textContent = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '暂无记录。点击工具栏扩展图标开始验证。';
    resultsEl.appendChild(p);
    return;
  }
  list.forEach((rec) => resultsEl.appendChild(renderRecord(rec)));
}

function renderRecord(rec) {
  const box = document.createElement('div');
  box.className = 'rec';

  const top = document.createElement('div');
  top.className = 'top';
  top.appendChild(badge(rec.ok ? 'ok' : 'err', rec.ok ? '成功' : '失败'));
  top.appendChild(badge('m', rec.mode === 'auto' ? `Auto → 命中 M${rec.finalMethod}` : labelMethod(rec.method)));
  if (rec.timingMs != null) top.appendChild(badge('m', `${rec.timingMs} ms`));
  else if (rec.totalMs != null) top.appendChild(badge('m', `总 ${rec.totalMs} ms`));
  box.appendChild(top);

  const kv = document.createElement('div');
  kv.className = 'kv';
  addKV(kv, 'URL', rec.url || '—');
  addKV(kv, '时间', rec.ts ? new Date(rec.ts).toLocaleTimeString() : '—');

  if (rec.mode === 'auto' && Array.isArray(rec.steps)) {
    addKV(kv, '降级链', rec.steps.map((s) => `M${s.method}:${s.ok ? '✓' : '✗'}(${s.timingMs}ms)`).join(' → '));
  }
  if (rec.main && rec.main.marker != null) addKV(kv, '__luban_poc', String(rec.main.marker));
  if (rec.error) addKV(kv, '错误', rec.error);
  if (rec.violation) addKV(kv, 'CSP 拦截', `${rec.violation.violatedDirective || ''} ${rec.violation.blockedURI || ''}`.trim());
  if (rec.csp) {
    if (rec.csp.summary) addKV(kv, 'CSP 摘要', rec.csp.summary);
    else if (rec.csp.error) addKV(kv, 'CSP 头', `抓取失败：${rec.csp.error}`);
    else if (rec.csp.skipped) addKV(kv, 'CSP 头', rec.csp.skipped);
    else addKV(kv, 'CSP 头', '（无 CSP 响应头）');
  }
  box.appendChild(kv);

  // 原始 violation / CSP 头详情（可折叠）
  const detail = rec.violation || (rec.csp && (rec.csp.csp || rec.csp.cspReportOnly));
  if (detail) {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(rec.violation || { csp: rec.csp.csp, cspReportOnly: rec.csp.cspReportOnly }, null, 2);
    box.appendChild(pre);
  }
  return box;
}

function addKV(kv, k, v) {
  const kd = document.createElement('div');
  kd.className = 'k';
  kd.textContent = k;
  const vd = document.createElement('div');
  vd.className = 'v';
  vd.textContent = v;
  kv.appendChild(kd);
  kv.appendChild(vd);
}

function badge(cls, text) {
  const b = document.createElement('span');
  b.className = 'badge ' + cls;
  b.textContent = text;
  return b;
}

function labelMethod(m) {
  return m === 1 ? 'Method 1' : m === 2 ? 'Method 2' : m === 3 ? 'Method 3' : 'Method ' + m;
}

/* ------------------------- 工具 ------------------------- */

function selectedMethod() {
  const el = document.querySelector('input[name="method"]:checked');
  const v = el ? el.value : '1';
  return v === 'auto' ? 'auto' : Number(v);
}

function send(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(resp);
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}
