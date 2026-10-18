import {workspaceAvailableToPanel} from './repositories/workspace-store';
import {panelTabId,executorKey,PANEL_PATH} from '../shared/panel-tab';
import {initializeTabPanels,openTabPanel,configureTabPanel,forgetTabPanel} from './services/tab-panel';
import {CodePreviewService} from './services/code-preview';
import {handleBridgeMessage, isBridgeMessage,bridgeConnection} from './services/bridge-connection';
import {PageGrants} from './services/page-grants';
import {ExternalDispatcher} from './services/external-dispatcher';
import {SavedRunner} from './services/saved-runner';
import {workflowCommand} from './services/workspace-workflow';
import { PageAnalysis } from './services/page-analysis';
import { exportCurrent } from './services/userscript-export';
import { verifyAutoSource } from './services/auto-origin';
import { AutoRuntime } from './services/auto-runtime';
import { ChromeAutoAdapter } from './services/auto-adapter';
import { VersionService } from './services/version-service';
import { executeTrial } from './services/trial-runner';
import { WorkspaceGeneration } from './services/workspace-generation';
import {AgentTransport} from './services/agent-transport';
import { acceptCapture, captureCurrentPage, captureBoundPage,currentSite } from './services/page-capture';
import { DataError } from './repositories/database';
import { assertExtensionPage, handleWorkspaceCommand, isWorkspaceCommand } from './repositories/workspace-router';
// Service Worker 入口：顶层同步注册所有监听（MV3 强制），消息按 type 路由到 handler。
// Content Script 通过 activeTab + chrome.scripting 按需注入（不声明 content_scripts）。

import type { GenerationCompleteMsg, GenerationFailedMsg, GenerationProgressMsg, LubanMessage, LubanResponse } from '../shared/messages';
import { ErrorFactory, ErrorLayer, LubanError, makeError } from '../shared/errors';
import { getProvider } from './ai-providers/base';
import './ai-providers/openai-compatible';
import { AiClient } from './ai-client';
import type { AiCaller } from './prompt-builder';
import { generateWithFallback } from './prompt-builder';
import { scanCode } from './safety-scanner';
import { getScriptStore } from './script-store';
import { readUiSnapshot, saveUiSnapshot } from './state-recovery';
import { getApiKey, getSettings, toProviderConfig } from '../shared/settings-store';
import { MIMO, PORT_NAMES } from '../shared/constants';
import { StreamKeepAlive } from './keepalive';
import type { GenerationResult, PageContext } from '../shared/types';
import contentScriptPath from '../content/index.ts?script&iife';

function isPanelSender(sender:chrome.runtime.MessageSender){try{const url=new URL(sender.url??'');return sender.id===chrome.runtime.id&&url.protocol==='chrome-extension:'&&url.hostname===chrome.runtime.id&&url.pathname==='/'+PANEL_PATH;}catch{return false;}}
function sourceTab(sender:chrome.runtime.MessageSender):number|undefined{
 if(!isPanelSender(sender))return;const id=panelTabId(sender.url??'');if(id===undefined)throw new DataError('TAB_SCOPE_REQUIRED','请关闭旧侧栏，在目标标签页重新点击鲁班图标。');return id;
}
async function panelScope(sender:chrome.runtime.MessageSender){const id=sourceTab(sender);return id===undefined?undefined:`${await getBrowserSession()}:${id}`;}
async function assertWorkspaceScope(sender:chrome.runtime.MessageSender,id:unknown,allowLegacy=false){if(typeof id!=='string')return;const scope=await panelScope(sender);const ws=scope?await getScriptStore().workspaces.get(id):undefined;if(scope&&ws?.panelScope!==scope&&!(allowLegacy&&ws&&workspaceAvailableToPanel(ws,scope)))throw new DataError('WRONG_TAB_WORKSPACE','此草稿属于其他标签页，请在当前标签页重新打开工具。');}


type Responder<T = unknown> = (r: LubanResponse<T>) => void;
let browserSession:Promise<string>|undefined;
function getBrowserSession():Promise<string>{return browserSession??=(async()=>{const key='luban:v3:browser-session';const existing=(await chrome.storage.session.get(key))[key];if(typeof existing==='string')return existing;const session=crypto.randomUUID();await chrome.storage.session.set({[key]:session});return session;})();}
const pageGrants=new PageGrants(getScriptStore(),bridgeConnection,getBrowserSession,captureCurrentPage,captureBoundPage);
bridgeConnection.setInvalidationHandler(()=>pageGrants.invalidateAll());
chrome.tabs.onRemoved?.addListener(tabId=>{void pageGrants.invalidateTab(tabId).catch(()=>{});});
chrome.tabs.onUpdated?.addListener((tabId,change)=>{if(change.url||change.status==='loading')void pageGrants.invalidateTab(tabId).catch(()=>{});});
type Handler = (
  msg: LubanMessage,
  sender: chrome.runtime.MessageSender,
  respond: Responder,
) => void | Promise<void>;

function createTabServices(tabId?:number){
const capture=(selectors?:string[])=>captureCurrentPage(selectors,tabId);
const workspaceGeneration = new WorkspaceGeneration(getScriptStore(), capture, async () => {
  const selectionKey=executorKey(tabId);const choice=tabId===undefined?(await chrome.storage.local.get(selectionKey))[selectionKey]:(await chrome.storage.session.get(selectionKey))[selectionKey]??(await chrome.storage.local.get('luban:v3:executor'))['luban:v3:executor'];
  if(choice==='codex'){
    if((await bridgeConnection.run('status')).status!=='connected')throw new DataError('BRIDGE_DISCONNECTED','请先在连接设置中连接 Bridge，再使用本地 Codex。');
    return {id:'local-codex',baseUrl:'https://local.codex.invalid',apiKey:'',model:'本地 Codex',billing:'onDemand' as const,customEndpoint:true,thinkingEnabled:false,thinkingProtocol:'none' as const};
  }
  const settings = await getSettings(); const key = await getApiKey(!!settings.customEndpoint);
  if (!key) throw ErrorFactory.keyInvalid();
  return toProviderConfig(settings, key);
}, workspaceId => {
  let transport:import('./services/workspace-generation').GenerationTransport;
  return {cancel:()=>transport?.cancel(),waitForStop:async()=>{await transport?.waitForStop?.();},generate:(config,messages,options,callbacks)=>{
    transport=config.id==='local-codex'?new AgentTransport((method,params)=>bridgeConnection.rpc(method,params),workspaceId!):new AiClient();
    return transport.generate(config,messages,options,callbacks);
  }};
});

const pageAnalysis = new PageAnalysis(capture, async()=>{
  const settings=await getSettings();const key=await getApiKey(!!settings.customEndpoint);
  if(!settings.pageAnalysisEnabled)throw new DataError('ANALYSIS_DISABLED','请先在设置中启用分析此页。');
  if(!key)throw ErrorFactory.keyInvalid();
  return toProviderConfig(settings,key);
},()=>new AiClient(),(id,content,truncated)=>{void chrome.runtime.sendMessage({type:'ANALYSIS_REASONING',requestId:id,content,truncated,attempt:1}).catch(()=>{});});
const versions = new VersionService(getScriptStore(), capture, executeTrial, autoRuntime.coordinate);
const savedRunner=new SavedRunner(getScriptStore(),capture,executeTrial);
return {workspaceGeneration,pageAnalysis,versions,savedRunner,capture};
}
const tabServices=new Map<number,ReturnType<typeof createTabServices>>();
function servicesFor(sender:chrome.runtime.MessageSender){const id=sourceTab(sender),key=id??0;let services=tabServices.get(key);if(!services){services=createTabServices(id);tabServices.set(key,services);}return services;}
chrome.tabs.onRemoved?.addListener(tabId=>{forgetTabPanel(tabId);void(async()=>{
 const services=tabServices.get(tabId);if(services){await services.workspaceGeneration.cancelAll();services.pageAnalysis.cancelAll();tabServices.delete(tabId);}
 await getScriptStore().workspaces.releasePanel(`${await getBrowserSession()}:${tabId}`);
 await chrome.storage.session.remove(executorKey(tabId));
})().catch(e=>console.error('[luban] close tab cleanup',e));});
const autoRuntime = new AutoRuntime(getScriptStore(), new ChromeAutoAdapter(), verifyAutoSource);
const codePreview=new CodePreviewService(getScriptStore(),async m=>{await chrome.runtime.sendMessage(m).catch(()=>{});});
const externalDispatcher=new ExternalDispatcher(getScriptStore(),pageGrants,(method,params)=>bridgeConnection.rpc(method,params),async(approval,command)=>{
  const scoped=new VersionService(getScriptStore(),selectors=>pageGrants.read(approval.grantId,selectors),async(binding,version,namespace,hash,values)=>{
    const grant=await pageGrants.require(approval.grantId,'trial.request');
    if(grant.binding.documentId!==binding.documentId||grant.navigationEpoch!==approval.navigationEpoch||hash!==approval.codeHash)throw new DataError('APPROVAL_BINDING_CHANGED','页面或代码已变化。');
    await bridgeConnection.rpc('tasks.check',{taskId:command.taskId,epoch:command.epoch,revision:command.revision});
    return executeTrial(binding,version,namespace,hash,values);
  },undefined,async()=>{await bridgeConnection.rpc('tasks.check',{taskId:command.taskId,epoch:command.epoch,revision:command.revision});});
  return scoped.trial(approval.workspaceId,approval.draftRevision,approval.id,command.source);
});
bridgeConnection.setTaskHandlers(command=>externalDispatcher.handle(command),(id,epoch)=>externalDispatcher.cancel(id,epoch),()=>externalDispatcher.reconcile());
externalDispatcher.setUpdateHandler(async(workspaceId,receipt)=>{await chrome.runtime.sendMessage({type:'V3_WORKSPACE_CHANGED',workspaceId,receipt}).catch(()=>{});});
void autoRuntime.ready().catch(e=>console.error('[luban] auto recovery',e));
chrome.runtime.onStartup?.addListener(()=>{void autoRuntime.retry().catch(console.error);});
chrome.permissions?.onRemoved?.addListener(()=>{void autoRuntime.retry().catch(console.error);void pageGrants.invalidateAll().catch(()=>{});});

// ── 顶层同步注册 ────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('[luban sw] installed');
});

// Global default stays disabled; each explicitly opened tab receives its own panel instance.
void initializeTabPanels().catch(e=>console.error('[luban] panel initialization',e));
chrome.tabs.onCreated?.addListener(tab=>{if(typeof tab.id==='number')void configureTabPanel(tab.id).catch(e=>console.error('[luban] configure tab panel',e));});
chrome.tabs.onReplaced?.addListener((added,removed)=>{forgetTabPanel(removed);void configureTabPanel(added).catch(e=>console.error('[luban] configure replacement panel',e));});
// Toolbar popup provides activeTab and calls open directly from its button gesture.

// 消息路由：始终返回 true 表示异步应答。
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg?.type==='V3_CHANNEL_SEND'){
    void(async()=>{try{assertExtensionPage(sender);sourceTab(sender);if(!isPanelSender(sender)||!['preview','confirm','cancelPreview'].includes(msg.method))throw new DataError('FORBIDDEN_SOURCE','只能从鲁班结果区预览并确认发送。');sendResponse({ok:true,data:await bridgeConnection.rpc('channel.'+msg.method,msg.params??{})});}catch(e){sendResponse({ok:false,error:e instanceof Error?e.message:'飞书发送失败。'});}})();return true;
  }
  if(msg?.type==='V3_EXTERNAL_APPROVAL'||msg?.type==='V3_BRIDGE_ADMIN'){
    void(async()=>{try{assertExtensionPage(sender);let data;
      if(msg.type==='V3_EXTERNAL_APPROVAL'){
        const tabId=sourceTab(sender);if(tabId!==undefined&&msg.action!=='list'){const row=(await externalDispatcher.list()).find(r=>r.id===msg.id);if(!row||row.binding.tabId!==tabId)throw new DataError('WRONG_TAB_APPROVAL','只能处理当前标签页的确认请求。');}
        if(msg.action==='list')data={approvals:await externalDispatcher.list(),conflicts:await externalDispatcher.conflicts()};
        else if(['approve','reject','review'].includes(msg.action)&&typeof msg.id==='string'){await externalDispatcher.decide(msg.id,msg.action);data={approvals:await externalDispatcher.list(),conflicts:await externalDispatcher.conflicts()};}
        else throw new DataError('INVALID_MESSAGE','确认操作无效。');
      }else{
        if(sender.url!==chrome.runtime.getURL('src/options/index.html'))throw new DataError('FORBIDDEN_SOURCE','请从连接设置发起。');
        if(msg.action==='channel'&&['status','connect','disconnect','bind','preview','confirm','cancelPreview','retry'].includes(msg.method))data=await bridgeConnection.rpc('channel.'+msg.method,msg.params??{});
        else if(msg.action==='agentStatus')data=await bridgeConnection.rpc('agent.status');
        else if(msg.action==='enroll'&&typeof msg.name==='string')data=await bridgeConnection.rpc('clients.enroll',{name:msg.name});
        else if(msg.action==='clients')data=await bridgeConnection.rpc('clients.list');
        else if(msg.action==='revokeClient'&&typeof msg.clientId==='string')data=await bridgeConnection.rpc('clients.revoke',{clientId:msg.clientId});
        else if(msg.action==='maintenance')data=await bridgeConnection.rpc('maintenance.run');
        else if(msg.action==='diagnostics')data=await bridgeConnection.rpc('diagnostics.export');
        else if(msg.action==='bridgeTasks')data=await bridgeConnection.rpc('tasks.list');
        else if(msg.action==='reviewBridgeTask'&&typeof msg.taskId==='string'&&msg.reviewed===true){await bridgeConnection.rpc('tasks.review',{taskId:msg.taskId});data=await bridgeConnection.rpc('tasks.list');}
        else throw new DataError('INVALID_MESSAGE','管理操作无效。');
      }if(msg.type==='V3_EXTERNAL_APPROVAL'){
        const tabId=sourceTab(sender);if(tabId!==undefined){
          const scope=await panelScope(sender),approvals=await externalDispatcher.list(),conflicts=await externalDispatcher.conflicts();
          const visible=[];for(const row of conflicts)if(row.workspaceId&&(await getScriptStore().workspaces.get(row.workspaceId))?.panelScope===scope)visible.push(row);
          data={approvals:approvals.filter(row=>row.binding.tabId===tabId),conflicts:visible};
        }
      }sendResponse({ok:true,data});
    }catch(e){sendResponse({ok:false,error:e instanceof Error?e.message:'操作失败。'});}})();return true;
  }
  if(msg?.type==='V3_PAGE_GRANT'){
    void(async()=>{try{assertExtensionPage(sender);if(msg.action==='grant'&&!isPanelSender(sender))throw new DataError('FORBIDDEN_SOURCE','请从网页侧栏明确授权。');let grants;const scopedTab=sourceTab(sender);await assertWorkspaceScope(sender,msg.workspaceId);if(scopedTab!==undefined&&msg.action==='grant'&&msg.tabId!==scopedTab)throw new DataError('WRONG_TAB','只能授权当前标签页。');
      if(msg.action==='list')grants=await pageGrants.list();
      else if(msg.action==='grant'&&Number.isInteger(msg.tabId)&&typeof msg.url==='string'&&(msg.allowDrafts===undefined||typeof msg.allowDrafts==='boolean'))grants=await pageGrants.create(msg.tabId,msg.url,msg.allowDrafts===true,typeof msg.workspaceId==='string'?msg.workspaceId:undefined,servicesFor(sender).capture);
      else if(msg.action==='revoke'&&(msg.id===undefined||typeof msg.id==='string')){if(scopedTab!==undefined){const ids=(await pageGrants.list()).filter(g=>g.binding.tabId===scopedTab&&(!msg.id||g.id===msg.id));for(const g of ids)await pageGrants.revoke(g.id);grants=await pageGrants.list();}else grants=await pageGrants.revoke(msg.id);}
      else throw new DataError('INVALID_MESSAGE','页面授权操作无效。');sendResponse({ok:true,data:{grants:scopedTab===undefined?grants:grants.filter(g=>g.binding.tabId===scopedTab)}});
    }catch(e){sendResponse({ok:false,error:e instanceof Error?e.message:'页面授权失败。'});}})();return true;
  }
  if (isBridgeMessage(msg)) { void handleBridgeMessage(msg, sender).then(sendResponse); return true; }
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
    const msg = raw as LubanMessage;
    if (msg.type === 'GENERATE_WORKSPACE') void handleGenerateWorkspace(port, msg, keepAlive);
    else void handleGenerateScript(port, msg, keepAlive);
  });
  port.onDisconnect.addListener(() => keepAlive.stop());
});

// ── 路由 ────────────────────────────────────────────────────
async function route(msg: LubanMessage, sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string' || typeof msg.requestId !== 'string') {
    respond(errorResponse(makeError(ErrorLayer.RUNTIME, 'INVALID_MESSAGE', '消息结构无效。', [{ type: 'DISMISS' }])));
    return;
  }
  try{sourceTab(sender);await assertWorkspaceScope(sender,(msg as unknown as {workspaceId?:string}).workspaceId,msg.type==='GET_WORKSPACE');}catch(e){respond(errorResponse(toLubanError(e)));return;}
  if(msg.type==='OPEN_CODE_PREVIEW'||msg.type==='CLOSE_CODE_PREVIEW'||msg.type==='CODE_PREVIEW_ACTION'){
    try{
      if(msg.type==='CODE_PREVIEW_ACTION'){respond({ok:true,data:await codePreview.action(msg,sender)});return;}
      assertExtensionPage(sender);
      if(msg.type==='CLOSE_CODE_PREVIEW'){
        const target=await codePreview.location(msg.sessionId);if(target){const tabId=sourceTab(sender);if(tabId!==undefined&&target.tabId!==tabId)throw new DataError('WRONG_TAB','不能关闭其他标签页的预览。');let ack;try{ack=await chrome.tabs.sendMessage(target.tabId,{type:'DISMISS_CODE_PREVIEW',requestId:msg.requestId,sessionId:msg.sessionId},{documentId:target.documentId});}catch{/* navigation removed the overlay */}if(ack?.ok===false)throw Error(ack.error);await codePreview.forget(msg.sessionId);}respond({ok:true,data:undefined});return;
      }
      const site=await currentSite(sourceTab(sender));const ws=await getScriptStore().workspaces.get(msg.workspaceId);if(!ws||ws.host!==site.host)throw Error('当前网页与脚本不匹配。');
      const injected=await chrome.scripting.executeScript({target:{tabId:site.tabId},files:[contentScriptPath]});const documentId=injected[0]?.documentId;if(!documentId)throw Error('当前网页不能展示代码浮层。');
      const snapshot=await codePreview.create(msg.workspaceId,msg.name,site.tabId,documentId);
      try{const ack=await chrome.tabs.sendMessage(site.tabId,{type:'RENDER_CODE_PREVIEW',requestId:msg.requestId,snapshot},{documentId});if(!ack?.ok)throw Error(ack?.error??'网页浮层不可用。');respond({ok:true,data:{sessionId:snapshot.sessionId,tabId:site.tabId,documentId}});}catch(e){await codePreview.forget(snapshot.sessionId);throw e;}
    }catch(e){respond(errorResponse(toLubanError(e)));}return;
  }
  if(['GET_WORKFLOW','UPDATE_WORKFLOW','CHECK_DRAFT','EDIT_FAILURE'].includes(msg.type)){try{assertExtensionPage(sender);respond({ok:true,data:await workflowCommand(getScriptStore(),msg as Extract<LubanMessage,{type:'GET_WORKFLOW'|'UPDATE_WORKFLOW'|'CHECK_DRAFT'|'EDIT_FAILURE'}>,servicesFor(sender).capture)});}catch(e){respond(errorResponse(toLubanError(e)));}return;}
  if(msg.type==='V21_PREVIEW_TARGET'||msg.type==='V21_CLEAR_PREVIEW'){try{assertExtensionPage(sender);const site=await currentSite(sourceTab(sender));respond({ok:true,data:await chrome.tabs.sendMessage(site.tabId,msg)});}catch(e){respond(errorResponse(toLubanError(e)));}return;}
  if(msg.type==='PREPARE_PAGE_ANALYSIS'||msg.type==='RUN_PAGE_ANALYSIS'||msg.type==='CANCEL_PAGE_ANALYSIS'){
    try{assertExtensionPage(sender);const data=msg.type==='PREPARE_PAGE_ANALYSIS'?await servicesFor(sender).pageAnalysis.prepare():msg.type==='RUN_PAGE_ANALYSIS'?await servicesFor(sender).pageAnalysis.run(msg.previewId):servicesFor(sender).pageAnalysis.cancel(msg.previewId);respond({ok:true,data});}catch(e){respond(errorResponse(toLubanError(e)));}return;
  }
  if(msg.type==='EXPORT_CURRENT'){
    try{assertExtensionPage(sender);if(typeof msg.scriptId!=='string')throw new DataError('INVALID_MESSAGE','工具编号无效。');respond({ok:true,data:await exportCurrent(getScriptStore(),msg.scriptId)});}catch(e){respond(errorResponse(toLubanError(e)));}return;
  }
  if(msg.type==='AUTO_BRIDGE'){
    try{respond({ok:true,data:await autoRuntime.bridge(msg.payload,sender)});}catch(e){respond({ok:false,error:e instanceof Error?e.message:String(e)} as unknown as LubanResponse);}return;
  }
  if(msg.type==='SET_AUTO_RUN'||msg.type==='RETRY_AUTO_RUN'||msg.type==='GET_RUNTIME_STATUS'||msg.type==='LIST_RUNTIME_STATUS'||msg.type==='GET_AUTO_DIAGNOSTICS'){
    try{assertExtensionPage(sender);const data=msg.type==='SET_AUTO_RUN'?await autoRuntime.setEnabled(msg.scriptId,msg.expectedRevision,msg.enabled):msg.type==='GET_RUNTIME_STATUS'?await autoRuntime.status(msg.scriptId):msg.type==='LIST_RUNTIME_STATUS'?await autoRuntime.statuses():msg.type==='GET_AUTO_DIAGNOSTICS'?await autoRuntime.diagnostics(msg.scriptId):await autoRuntime.retry();respond({ok:true,data});}catch(e){respond(errorResponse(toLubanError(e)));}return;
  }
  if (msg.type === 'TRIAL_DRAFT' || msg.type === 'COMMIT_DRAFT' || msg.type === 'RESTORE_PREVIOUS') {
    try {
      assertExtensionPage(sender);
      if (typeof msg.workspaceId !== 'string' || !Number.isInteger(msg.expectedDraftRevision)) throw new DataError('INVALID_MESSAGE', '工作区参数无效。');
      if(msg.type==='COMMIT_DRAFT'&&msg.effectAcknowledged!==true)throw new DataError('EFFECT_CONFIRM_REQUIRED','请点击效果符合保存。');
      const data = msg.type === 'TRIAL_DRAFT' ? await servicesFor(sender).versions.trial(msg.workspaceId, msg.expectedDraftRevision,msg.requestId)
        : msg.type === 'COMMIT_DRAFT' ? await servicesFor(sender).versions.commit(msg.workspaceId, msg.expectedDraftRevision, msg.receiptId, msg.name, msg.opId,msg.effectAcknowledged)
        : await servicesFor(sender).versions.restore(msg.workspaceId, msg.expectedDraftRevision, msg.expectedRevision, msg.discardDraft, msg.opId);
      respond({ok:true,data});
    } catch(e) { respond(errorResponse(toLubanError(e))); } return;
  }
  if (msg.type === 'CAPTURE_REPORT') {
    try { await acceptCapture(msg.requestId, msg.context, sender); respond({ ok: true, data: undefined }); }
    catch (e) { respond(errorResponse(toLubanError(e))); }
    return;
  }
  if (['GET_CURRENT_SITE', 'GET_SCRIPT_RECORD', 'PREPARE_GENERATION', 'CANCEL_WORKSPACE_GENERATION'].includes(msg.type)) {
    try {
      assertExtensionPage(sender);
      if (msg.type === 'GET_CURRENT_SITE') respond({ ok: true, data: await currentSite(sourceTab(sender)) });
      else if (msg.type === 'GET_SCRIPT_RECORD') respond({ ok: true, data: await getScriptStore().record(msg.scriptId) });
      else if (msg.type === 'PREPARE_GENERATION') respond({ ok: true, data: await servicesFor(sender).workspaceGeneration.prepare(msg.workspaceId, msg.expectedDraftRevision, msg.selectors,msg.repairAllowed) });
      else if (msg.type === 'CANCEL_WORKSPACE_GENERATION') { await servicesFor(sender).workspaceGeneration.cancel(msg.workspaceId); respond({ ok: true, data: undefined }); }
    } catch (e) { respond(errorResponse(toLubanError(e))); }
    return;
  }
  if (isWorkspaceCommand(msg.type)) {
    try { respond({ ok: true, data: await handleWorkspaceCommand(msg, sender, getScriptStore(),await panelScope(sender)) }); }
    catch (e) { respond(errorResponse(toLubanError(e))); }
    return;
  }
  const handler = HANDLERS[msg.type];
  if (!handler) {
    respond(errorResponse(makeError(ErrorLayer.NETWORK, 'UNKNOWN_TYPE', `未知消息类型：${String(msg.type)}`, [{ type: 'DISMISS' }])));
    return;
  }
  try {
    if (!['ELEMENT_PICKED','PICK_CANCELLED','FOCUS_PANEL'].includes(msg.type)) assertExtensionPage(sender);
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

async function handleGenerateWorkspace(port: chrome.runtime.Port, msg: Extract<LubanMessage, { type: 'GENERATE_WORKSPACE' }>, keepAlive: StreamKeepAlive): Promise<void> {
  let finished = false;
  let connectionClosed = false;
  const post = (message: unknown) => { try { port.postMessage(message); } catch { /* 面板关闭；数据仍由仓储保护 */ } };
  const disconnected = () => { connectionClosed = true; if (!finished) void servicesFor(port.sender??{}).workspaceGeneration.cancel(msg.workspaceId); };
  port.onDisconnect.addListener(disconnected);
  try {
    assertExtensionPage(port.sender ?? {});await assertWorkspaceScope(port.sender??{},msg.workspaceId);keepAlive.start();
    const result = await servicesFor(port.sender??{}).workspaceGeneration.generate(msg.workspaceId, msg.envelopeId, msg.requestId,
      content => post({ type: 'GENERATION_PROGRESS', requestId: msg.requestId, content, done: false }), () => connectionClosed,stage=>post({type:'GENERATION_REASONING',requestId:msg.requestId,content:stage.text,truncated:stage.truncated,attempt:stage.attempt}));
    finished = true; post({ type: 'GENERATION_COMPLETE', requestId: msg.requestId, result: result.result });
  } catch (e) { finished = true; post({ type: 'GENERATION_FAILED', requestId: msg.requestId, error: toLubanError(e).serialize() }); }
  finally { keepAlive.stop(); port.onDisconnect.removeListener(disconnected); }
}

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
    assertExtensionPage(port.sender ?? {});
    await getScriptStore().ready();
    let lastModel: string = MIMO.models.flash;
    let lastTokens = 0;
    const settings=await getSettings();const apiKey=await getApiKey(!!settings.customEndpoint);
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
          { jsonMode: true, thinking: settings.thinkingEnabled!==false },
          { onDelta },
        );
        lastTokens = outcome.usage?.total_tokens ?? lastTokens;
        return outcome.text;
      },
    };

    const data = await generateWithFallback(
      caller,
      msg.context,
      msg.intent,
      settings.customEndpoint ? settings.customModel! : MIMO.models.flash,
      settings.customEndpoint ? settings.customModel! : MIMO.models.pro,
      (acc) => {
        const progress: GenerationProgressMsg = { type: 'GENERATION_PROGRESS', requestId: msg.requestId, content: acc, done: false };
        port.postMessage(progress);
      },
      msg.regenerateContext,
    );

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
async function handleInjectScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, _respond: Responder): Promise<void> {
  if (msg.type !== 'INJECT_SCRIPT') return;
  throw new DataError('WORKSPACE_REQUIRED', '请从工作区确认试运行；不接受前端直接传入任意代码。');
}

async function handleSaveScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, _respond: Responder): Promise<void> {
  if (msg.type !== 'SAVE_SCRIPT') return;
  throw new DataError('WORKSPACE_REQUIRED', '请在工作区生成或修改，确认试运行后保存；旧版直接保存入口已停用。');
}

async function handleRunSavedScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if(msg.type!=='RUN_SAVED_SCRIPT')return;
  const started=Date.now(),result=await servicesFor(_sender).savedRunner.run(msg.scriptId,msg.requestId);
  respond({ok:true,data:{ok:result.ok&&!result.timedOut,method:1,timingMs:Date.now()-started,scriptError:result.error}});
}

async function handleListScripts(_msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  const list = await getScriptStore().list();
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  respond({ ok: true, data: list });
}

async function handleDeleteScript(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'DELETE_SCRIPT') return;
  const record=await getScriptStore().record(msg.scriptId);
  if(record)await autoRuntime.delete(msg.scriptId,record.recordRevision);
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
  if (typeof tabId === 'number') void openTabPanel(tabId).catch(() => undefined);
  respond({ ok: true, data: undefined });
}




// ── handlers ────────────────────────────────────────────────
// 链路自检：
//  - to:'content' → 注入 content（ISOLATED），tabs.sendMessage(PING) → 回 PONG(content)。
//  - to:'main'    → executeScript world:MAIN 直接探针 → 回 PONG(main)（浏览器级注入，绕过页面 CSP）。
async function handlePing(msg: LubanMessage, _sender: chrome.runtime.MessageSender, respond: Responder): Promise<void> {
  if (msg.type !== 'PING') return;
  const tabId = await resolveActiveTabId(_sender);
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
  const tabId = await resolveActiveTabId(_sender);
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
  const tabId = await resolveActiveTabId(_sender);
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
  const tabId = await resolveActiveTabId(_sender);
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
  try{assertExtensionPage(_sender);}catch(e){respond(errorResponse(toLubanError(e)));return;}
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
async function resolveActiveTabId(sender:chrome.runtime.MessageSender): Promise<number> {
 const id=sourceTab(sender);if(id!==undefined)return id;
 throw new DataError('TAB_SCOPE_REQUIRED','请在目标标签页点击鲁班图标。');
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
  if (e instanceof DataError) return makeError(ErrorLayer.RUNTIME, e.code, e.message, [{ type: 'DISMISS' }]);
  const message = e instanceof Error ? e.message : String(e);
  return makeError(ErrorLayer.NETWORK, 'UNEXPECTED', message, [{ type: 'DISMISS' }], e instanceof Error ? e : undefined);
}

function errorResponse(e: LubanError): LubanResponse<never> {
  return { ok: false, error: e.serialize() };
}
