// Service Worker 入口：顶层同步注册所有监听（MV3 强制），消息按 type 路由到 handler。
// Content Script 通过 activeTab + chrome.scripting 按需注入（不声明 content_scripts）。

import type { GenerationCompleteMsg, GenerationFailedMsg, GenerationProgressMsg, InjectViaScriptTagMsg, LubanMessage, LubanResponse } from '../shared/messages';
import { ErrorFactory, ErrorLayer, LubanError, makeError } from '../shared/errors';
import { getProvider } from './ai-providers/base';
import './ai-providers/openai-compatible';
import { AiClient } from './ai-client';
import type { AiCaller } from './prompt-builder';
import { generateWithFallback } from './prompt-builder';
import { tryPageScopeStub } from './page-scope-stub';
import { scanCode } from './safety-scanner';
import { injectScript } from './injection-dispatcher';
import { getScriptStore, pageMatchesScript } from './script-store';
import { readUiSnapshot, saveUiSnapshot } from './state-recovery';
import { getApiKey, getSettings, toProviderConfig } from '../shared/settings-store';
import { MIMO, PORT_NAMES } from '../shared/constants';
import { makeRequestId } from '../shared/messages';
import { StreamKeepAlive } from './keepalive';
import type { GenerationResult, InjectionResult, PageContext } from '../shared/types';
import contentScriptPath from '../content/index.ts?script&iife';

/** 记录最近一次点击图标时授予 activeTab 的标签页（存 session，随浏览器关闭清除）。 */
const ACTIVE_TAB_KEY = 'luban:activeTabId';

type Responder<T = unknown> = (r: LubanResponse<T>) => void;
type Handler = (
  msg: LubanMessage,
  sender: chrome.runtime.MessageSender,
  respond: Responder,
) => void | Promise<void>;

// ── 顶层同步注册 ────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[luban sw] installed');
});

// 点击图标：记住当前标签页（此刻拿到 activeTab 授权）并打开侧栏。
chrome.action.onClicked.addListener((tab) => {
  const url = tab.url ?? '';
  const scriptable = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
  if (typeof tab.id === 'number' && scriptable) {
    void chrome.storage.session.set({ [ACTIVE_TAB_KEY]: tab.id });
  }
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
    /* 老版本无 open()，忽略 */
  });
});

// 消息路由：始终返回 true 表示异步应答。
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  void route(msg as LubanMessage, sender, sendResponse as Responder);
  return true;
});

// 生成链路走长连接 Port（§3.3 / §七）：Side Panel connect 后用一个 Port 承载
// 「GENERATE_SCRIPT 请求 → 多次 GENERATION_PROGRESS → 一次 COMPLETE/FAILED」整条流，
// 相比一次性 sendMessage 更贴合流式场景，也便于保活（StreamKeepAlive 挂在 Port 上）。
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAMES.GENERATION) return;
  const keepAlive = new StreamKeepAlive(port);
  port.onMessage.addListener((raw) => {
    void handleGenerateScript(port, raw as LubanMessage, keepAlive);
  });
  port.onDisconnect.addListener(() => keepAlive.stop());
});

// ── 路由 ────────────────────────────────────────────────────
async function route(msg: LubanMessage, sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  const handler = HANDLERS[msg.type];
  if (!handler) {
    respond(errorResponse(makeError(ErrorLayer.NETWORK, 'UNKNOWN_TYPE', `未知消息类型：${String(msg.type)}`, [{ type: 'DISMISS' }])));
    return;
  }
  try {
    await handler(msg, sender, respond);
  } catch (e) {
    respond(errorResponse(toLubanError(e)));
  }
}

const HANDLERS: Partial<Record<LubanMessage['type'], Handler>> = {
  PING: handlePing,
  START_PICKER: handleStartPicker,
  COLLECT_PAGE_CONTEXT: handleCollectPageContext,
  CANCEL_PICKER: handleCancelPicker,
  ELEMENT_PICKED: handleElementPicked,
  PICK_CANCELLED: handlePickCancelled,
  TEST_CONNECTION: handleTestConnection,
  CANCEL_GENERATION: handleCancelGeneration,
  INJECT_SCRIPT: handleInjectScript,
  SAVE_SCRIPT: handleSaveScript,
  RUN_SAVED_SCRIPT: handleRunSavedScript,
  LIST_SCRIPTS: handleListScripts,
  DELETE_SCRIPT: handleDeleteScript,
  GET_STATE: handleGetState,
  SET_UI_STATE: handleSetUiState,
  FOCUS_PANEL: handleFocusPanel,
};

// ── AI 生成（P3-T5）──────────────────────────────────────────
// 当前正在进行的生成会话（单 Side Panel 场景下全局唯一；取消按钮据此中止）。
let activeClient: AiClient | null = null;

async function handleGenerateScript(
  port: chrome.runtime.Port,
  msg: LubanMessage,
  keepAlive: StreamKeepAlive,
): Promise<void> {
  if (msg.type !== 'GENERATE_SCRIPT') return;
  keepAlive.start();
  try {
    let lastModel: string = MIMO.models.flash;
    let lastTokens = 0;
    let data;

    const pageStub = tryPageScopeStub(msg.context, msg.intent);
    if (pageStub) {
      data = pageStub;
      lastModel = 'page-scope-stub';
    } else {
      const [settings, apiKey] = await Promise.all([getSettings(), getApiKey()]);
      if (!apiKey) throw ErrorFactory.keyInvalid();

      lastModel = settings.defaultModel || MIMO.models.flash;
      const caller: AiCaller = {
        async generate(messages, model, onDelta) {
          lastModel = model;
          const client = new AiClient();
          activeClient = client;
          const outcome = await client.generate(
            { ...toProviderConfig(settings, apiKey), model },
            messages,
            { jsonMode: true, thinking: false },
            { onDelta },
          );
          lastTokens = outcome.usage?.total_tokens ?? lastTokens;
          return outcome.text;
        },
      };

      data = await generateWithFallback(
        caller,
        msg.context,
        msg.intent,
        MIMO.models.flash,
        MIMO.models.pro,
        (acc) => {
          const progress: GenerationProgressMsg = { type: 'GENERATION_PROGRESS', requestId: msg.requestId, content: acc, done: false };
          port.postMessage(progress);
        },
        msg.regenerateContext,
      );
    }

    const scan = scanCode(data.code, data.gmGrants);
    const result: GenerationResult = {
      requestId: msg.requestId,
      ...data,
      // 真实黑名单扫描 + gmGrants 白名单校验（P4-T1/T2），blocked 非空时预览态禁用「运行」。
      safety: scan,
      warnings: [...data.warnings, ...scan.warnings],
      model: lastModel,
      tokensUsed: lastTokens,
    };
    const complete: GenerationCompleteMsg = { type: 'GENERATION_COMPLETE', requestId: msg.requestId, result };
    port.postMessage(complete);
  } catch (e) {
    const failed: GenerationFailedMsg = { type: 'GENERATION_FAILED', requestId: msg.requestId, error: toLubanError(e).serialize() };
    port.postMessage(failed);
  } finally {
    activeClient = null;
    keepAlive.stop();
  }
}

// 取消生成：中止当前 AiClient 的 fetch（AbortController），cancel() 内部区分「用户取消」与超时。
function handleCancelGeneration(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): void {
  activeClient?.cancel();
  respond({ ok: true, data: undefined });
}

// ── 注入执行（P5-T1/T5）────────────────────────────────────────
// 「运行」按钮触发：按降级链调度注入，method 2/3 需要先确保 content 已注入才能转发 INJECT_VIA_SCRIPT_TAG。
async function handleInjectScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'INJECT_SCRIPT') return;
  const result = await runInjected(msg.requestId, msg.code, msg.gmGrants, msg.scriptId, msg.storageSnapshot);
  respond({ ok: true, data: result });
}

async function handleSaveScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'SAVE_SCRIPT') return;
  const id = await getScriptStore().save(msg.script);
  await notifyPage('脚本已保存');
  respond({ ok: true, data: { id } });
}

async function handleRunSavedScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'RUN_SAVED_SCRIPT') return;
  const script = await getScriptStore().get(msg.scriptId);
  if (!script) {
    throw makeError(ErrorLayer.RUNTIME, 'SCRIPT_MISSING', '脚本不存在或已被删除。', [{ type: 'DISMISS' }]);
  }
  const tabId = await resolveActiveTabId();
  const tab = await chrome.tabs.get(tabId).catch((e: unknown) => {
    throw toActiveTabError(e);
  });
  if (!tab.url || !pageMatchesScript(tab.url, script.matches)) {
    throw makeError(ErrorLayer.RUNTIME, 'WRONG_PAGE', '请先打开目标页面', [{ type: 'DISMISS' }]);
  }
  const result = await runInjected(msg.requestId, script.code, script.gmGrants, script.id, {});
  respond({ ok: true, data: result });
}

async function handleListScripts(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  const list = await getScriptStore().list();
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  respond({ ok: true, data: list });
}

async function handleDeleteScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'DELETE_SCRIPT') return;
  await getScriptStore().delete(msg.scriptId);
  respond({ ok: true, data: undefined });
}

async function handleGetState(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  respond({ ok: true, data: await readUiSnapshot() });
}

async function handleSetUiState(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'SET_UI_STATE') return;
  await saveUiSnapshot(msg.snapshot, msg.updatedAt);
  respond({ ok: true, data: undefined });
}

function handleFocusPanel(_msg: LubanMessage, sender: chrome.runtime.MessageSender, respond: Responder): void {
  const tabId = sender.tab?.id;
  if (typeof tabId === 'number') void chrome.sidePanel.open({ tabId }).catch(() => undefined);
  respond({ ok: true, data: undefined });
}

async function runInjected(
  requestId: string,
  code: string,
  gmGrants: string[],
  scriptId: string | undefined,
  storageSnapshot: Record<string, unknown>,
): Promise<InjectionResult> {
  const tabId = await resolveActiveTabId();
  let domain = 'unknown';
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) domain = new URL(tab.url).hostname;
  } catch (e) {
    throw toActiveTabError(e);
  }
  const snapshot = scriptId ? await getScriptStore().readGm(scriptId) : storageSnapshot;
  const result = await injectScript(tabId, domain, code, gmGrants, snapshot, async (tid, method, injectedCode, grants, snap) => {
    await ensureContentInjected(tid);
    const injectMsg: InjectViaScriptTagMsg = {
      type: 'INJECT_VIA_SCRIPT_TAG',
      requestId,
      code: injectedCode,
      method,
      gmGrants: grants,
      storageSnapshot: snap,
    };
    const res = (await chrome.tabs.sendMessage(tid, injectMsg)) as LubanResponse<{
      ok: boolean;
      timedOut: boolean;
      dirty: Record<string, unknown>;
      scriptError?: string;
    }>;
    if (!res.ok) throw new Error(res.error.message);
    return res.data;
  });
  if (scriptId && result.dirty && Object.keys(result.dirty).length > 0) {
    await getScriptStore().writeGm(scriptId, result.dirty);
  }
  return result;
}

async function notifyPage(text: string): Promise<void> {
  try {
    const tabId = await resolveActiveTabId();
    await ensureContentInjected(tabId);
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_TOAST', requestId: makeRequestId(), text });
  } catch {
    // 页面不可注入时保存仍然成功，不把 Toast 失败冒泡成保存失败。
  }
}

// ── handlers ────────────────────────────────────────────────
// 链路自检：
//  - to:'content' → 注入 content（ISOLATED），tabs.sendMessage(PING) → 回 PONG(content)。
//  - to:'main'    → executeScript world:MAIN 直接探针 → 回 PONG(main)（浏览器级注入，绕过页面 CSP）。
async function handlePing(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'PING') return;
  const tabId = await resolveActiveTabId();
  if (msg.to === 'main') {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: mainWorldProbe,
        args: [msg.requestId],
      });
      respond({ ok: true, data: result?.result });
    } catch (e) {
      throw toActiveTabError(e);
    }
    return;
  }
  await ensureContentInjected(tabId);
  try {
    const pong = (await chrome.tabs.sendMessage(tabId, msg)) as LubanMessage;
    respond({ ok: true, data: pong });
  } catch (e) {
    throw toActiveTabError(e);
  }
}

// 运行于 MAIN world 的自包含探针：证明页面主上下文可达（不引用外部闭包变量）。
function mainWorldProbe(requestId: string): { type: 'PONG'; from: 'main'; requestId: string } {
  const w = globalThis as unknown as { __luban_poc?: boolean };
  w.__luban_poc = true;
  return { type: 'PONG', from: 'main', requestId };
}

// 启动元素选择：Phase 1 仅打通「注入 content 并转发指令」，采集逻辑随 Phase 2 落地。
async function handleStartPicker(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  const tabId = await resolveActiveTabId();
  await ensureContentInjected(tabId);
  try {
    const ack = (await chrome.tabs.sendMessage(tabId, { ..._msg })) as unknown;
    respond({ ok: true, data: ack });
  } catch (e) {
    throw toActiveTabError(e);
  }
}

async function handleCollectPageContext(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'COLLECT_PAGE_CONTEXT') return;
  const tabId = await resolveActiveTabId();
  await ensureContentInjected(tabId);
  try {
    const data = (await chrome.tabs.sendMessage(tabId, msg)) as { context: PageContext };
    respond({ ok: true, data });
  } catch (e) {
    throw toActiveTabError(e);
  }
}

// 元素已选中：content 直接广播到全扩展上下文（SW + Side Panel 均会收到）。
// Side Panel 自行据此更新状态机，SW 侧仅需确认收到，不做二次转发（避免重复投递）。
function handleElementPicked(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): void {
  respond({ ok: true, data: undefined });
}

// 侧栏「取消选择」：转发给 content 真正停止选择器（之前只改侧栏状态，页面监听器未清理，已修复）。
async function handleCancelPicker(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  const tabId = await resolveActiveTabId();
  try {
    await chrome.tabs.sendMessage(tabId, { ..._msg });
  } catch {
    // 页面可能已跳转/关闭，选择器随之失效，无需额外提示用户。
  }
  respond({ ok: true, data: undefined });
}

// 页面内 Esc 取消：同 ELEMENT_PICKED，content 直接广播，SW 侧仅确认。
function handlePickCancelled(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): void {
  respond({ ok: true, data: undefined });
}

// AI 设置页「测试连接」：由 SW 统一发出网络请求（Key 集中管理、规避页面 CORS 干扰，§B.5）。
async function handleTestConnection(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'TEST_CONNECTION') return;
  const provider = getProvider('openai-compatible');
  if (!provider) {
    respond(errorResponse(makeError(ErrorLayer.NETWORK, 'NO_PROVIDER', '未找到可用的 AI Provider。', [{ type: 'DISMISS' }])));
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const result = await provider.testConnection(msg.config, controller.signal);
  clearTimeout(timer);
  if (result.ok) {
    respond({ ok: true, data: { latencyMs: result.latencyMs } });
  } else {
    respond(errorResponse(result.error ?? toLubanError(new Error('测试连接失败'))));
  }
}

// ── 注入 / tab 辅助 ─────────────────────────────────────────
// 注意：这里只能返回「点击图标时记下的 tabId」。
// chrome.tabs.query 查到的「当前活动标签页」不等于已被授予 activeTab 权限——
// 若在此处用 tabs.query 兜底，会把一个未授权的 tabId 传给 executeScript，
// 最终在注入时才抛出 Chrome 原生的「Cannot access contents of the page」错误，
// 而不是我们设计好的友好提示。因此没有存量 tabId 时必须直接报错，不做虚假兜底。
async function resolveActiveTabId(): Promise<number> {
  const stored = await chrome.storage.session.get(ACTIVE_TAB_KEY);
  const id = stored[ACTIVE_TAB_KEY] as number | undefined;
  if (typeof id === 'number') return id;
  throw makeError(ErrorLayer.CAPTURE, 'NO_ACTIVE_TAB', '请先点击扩展图标以授权当前页面。', [
    { type: 'DISMISS' },
  ]);
}

// 即使存有 tabId，activeTab 授权也可能已失效（标签页跳转/刷新/关闭），
// 或该 tabId 本就指向浏览器内置页（chrome://、Chrome 应用商店等——这类页面
// 无论是否点过图标都永久无法注入，必须和「授权失效」区分成不同的提示）。
// 统一拦截 Chrome 原生权限报错，转换成对应的友好提示，而不是让其直接冒泡。
function toActiveTabError(e: unknown): LubanError {
  const message = e instanceof Error ? e.message : String(e);
  if (/Cannot access a chrome:\/\/ URL|Cannot access contents of url|chrome web store/i.test(message)) {
    return ErrorFactory.captureRestrictedPage();
  }
  if (/Cannot access contents of the page|No tab with id|cannot be scripted/i.test(message)) {
    return makeError(
      ErrorLayer.CAPTURE,
      'ACTIVE_TAB_EXPIRED',
      '当前页面的授权已失效，请重新点击扩展图标后再试。',
      [{ type: 'RETRY' }],
      e instanceof Error ? e : undefined,
    );
  }
  return toLubanError(e);
}

// 幂等注入 content（CRXJS 产出的自包含 IIFE）。重复注入由 content 内部守卫拦截。
async function ensureContentInjected(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [contentScriptPath] });
  } catch (e) {
    throw toActiveTabError(e);
  }
}

// ── 错误/响应封装 ───────────────────────────────────────────
function toLubanError(e: unknown): LubanError {
  if (e instanceof LubanError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return makeError(ErrorLayer.NETWORK, 'UNEXPECTED', message, [{ type: 'DISMISS' }], e instanceof Error ? e : undefined);
}

function errorResponse(e: LubanError): LubanResponse<never> {
  return { ok: false, error: e.serialize() };
}
