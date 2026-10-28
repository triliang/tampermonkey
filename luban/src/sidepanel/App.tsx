import {PageResourceTree} from './components/PageResourceTree';
import type {PageResources} from '../shared/page-resources';
import {ModelPicker} from './components/ModelPicker';
import {HarnessTranscript} from './v4/HarnessTranscript';
import {HarnessCards,HarnessActions} from './v4/HarnessChat';
import {useHarnessChat,conversationTimeline} from './v4/useHarnessChat';
import {panelTabId,executorKey} from '../shared/panel-tab';
import {ExternalApprovals} from '../shared/ExternalApprovals';
import {SendToFeishu} from '../shared/SendToFeishu';
import brandLogo from '../assets/logo.svg';
import type {ScriptAttachment} from '../shared/script-attachment';
import {scriptFilename} from '../shared/script-attachment';
import {ReasoningDetails} from './components/ReasoningDetails';
import type {ReasoningStage} from '../shared/reasoning';
import {CodeArtifactDialog} from './components/CodeArtifactDialog';
import {ChatMarkdown} from './components/ChatMarkdown';
import {createReference,lineLabel} from '../shared/code-reference';
import type {CodeReference} from '../shared/code-reference';
import {workspaceStage} from './workspace-controller';
import {TargetCard,QualityCard} from './components/WorkflowCards';
import {emptyWorkflow} from '../shared/v21-types';
import type {Workflow,TargetCandidate,QualityReport} from '../shared/v21-types';
import {thinkingProtocol} from '../shared/thinking';
import { getSettings,saveThinkingEnabled,toProviderConfig } from '../shared/settings-store';
import type { AnalysisPreview, PageSuggestion } from '../shared/p7-types';
import { ScriptLibrary } from '../shared/ScriptLibrary';
import { ExportDialog } from '../shared/ExportDialog';
import type { ExportArtifact } from '../shared/p5-types';
import type { InjectionResult } from '../shared/types';
import { hostPermissionOrigins } from '../shared/host-policy';
import type { RuntimeStatus } from '../shared/p4-types';
import type { TrialReceipt, TrialResult } from '../shared/p3-types';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { sendToSW } from './comms';
import { makeRequestId } from '../shared/messages';
import type { LubanMessage } from '../shared/messages';
import { GM_P0_GRANTS, PORT_NAMES,STORAGE_KEYS } from '../shared/constants';
import type { ScriptMeta, TargetElement } from '../shared/types';
import type { ConversationMessage, DraftPatch, ScriptRecord, WorkspaceRecord } from '../shared/v2-types';
import type { GenerationEnvelope } from '../shared/p2-types';
import type {PageGrantsReply} from '../shared/bridge-types';
import { DraftBuffer } from '../service-worker/repositories/draft-buffer';

interface Site { tabId: number; host: string; url: string; title: string; }
interface Opened { workspace: WorkspaceRecord; messages: ConversationMessage[]; }
async function call<T>(message: LubanMessage): Promise<T> {
  const r = await sendToSW<T>(message); if (!r.ok) throw Error(r.error.message); return r.data;
}
const rid = () => makeRequestId();
export default function App({initialView='home',embedded=false,initialMode='v4'}:{initialView?:'home'|'library';embedded?:boolean;initialMode?:'v3'|'v4'}={}) {
  const agentEnabled=initialMode!=='v3';
  const boundTabId=useRef(panelTabId(window.location.href)).current;
  const executorStorage=boundTabId===undefined?chrome.storage.local:chrome.storage.session;
  const currentExecutorKey=executorKey(boundTabId);
  const chatWorkspaceKey='luban:chat:workspace:'+String(boundTabId??'options');
  const restoreAttempted=useRef(false);
  const inputRef=useRef('');
  const pagePreview=useRef<{sessionId:string;workspaceId:string}|null>(null);
  const previewFocusChat=useRef(false);
  const pagePreviewInput=useRef<string|null>(null);
  const [previewBusy,setPreviewBusy]=useState(false);
  const [activeScriptAttachment,setActiveScriptAttachment]=useState<ScriptAttachment>();
  const [reasoningStages,setReasoningStages]=useState<ReasoningStage[]>([]);
  const [analysisReasoning,setAnalysisReasoning]=useState<ReasoningStage[]>([]);
  const [artifactOpen,setArtifactOpen]=useState(false);
  const [contextOpen,setContextOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [providerName,setProviderName]=useState('第三方模型');
  useEffect(()=>{if(!settingsOpen)return;const outside=(e:PointerEvent)=>{if(e.target instanceof Element&&!e.target.closest('.chat-settings,.chat-bottom-tools'))setSettingsOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setSettingsOpen(false);document.querySelector<HTMLButtonElement>('.chat-config-button[aria-controls="chat-connection-settings"]')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[settingsOpen]);
  const [pageGrantMessage,setPageGrantMessage]=useState('');
  const [grantBusy,setGrantBusy]=useState(false);
  const [allowExternalDrafts,setAllowExternalDrafts]=useState(false);
  async function grantCurrentPage(){if(!site)return;setGrantBusy(true);try{const target=allowExternalDrafts?await ensureWorkspace():undefined;const result=await chrome.runtime.sendMessage({type:'V3_PAGE_GRANT',action:'grant',tabId:site.tabId,url:site.url,allowDrafts:allowExternalDrafts,...(target?{workspaceId:target.id}:{})}) as PageGrantsReply;if(!result.ok)throw Error(result.error);setPageGrantMessage(allowExternalDrafts?'已允许读取摘要、提交候选和申请试运行；执行仍需逐次确认。':'已授权本机集成读取此文档摘要。导航、断连或重启后需要重新授权。');}catch(e){setPageGrantMessage(e instanceof Error?e.message:'页面授权失败。');}finally{setGrantBusy(false);}}
  const [reference,setReference]=useState<CodeReference|null>(null);
  const [queuedText,setQueuedText]=useState('');
  const queued=useRef('');
  const chatScroll=useRef<HTMLDivElement|null>(null);
  const follow=useRef(true);
  const [showLatest,setShowLatest]=useState(false);
  const [thinkingEnabled,setThinkingEnabled]=useState(true);
  const [thinkingSupported,setThinkingSupported]=useState(true);
  const [thinkingSaving,setThinkingSaving]=useState(false);
  const [analysisEnabled,setAnalysisEnabled]=useState(false);
  const [analysisPreview,setAnalysisPreview]=useState<AnalysisPreview|null>(null);
  const [suggestions,setSuggestions]=useState<PageSuggestion[]>([]);
  const [analysing,setAnalysing]=useState(false);
  const analysisEpoch=useRef(0);
  const analysisId=useRef('');
  const [workflow,setWorkflow]=useState<Workflow>(emptyWorkflow());
  const [constraints,setConstraints]=useState('');
  const [repairAllowed,setRepairAllowed]=useState(true);
  const [quality,setQuality]=useState<QualityReport|null>(null);
  const [feedbackMode,setFeedbackMode]=useState(false);
  const [operation,setOperation]=useState<'trial'|'save'|'restore'|'rename'|null>(null);
  const [view, setView] = useState<'home'|'editor'|'library'>(initialView);
  const [site, setSite] = useState<Site|null>(null);
  const [siteError,setSiteError]=useState('');
  const [resourceRevision,setResourceRevision]=useState(0);
  const [resources,setResources]=useState<PageResources|null>(null),[resourceError,setResourceError]=useState('');
  useEffect(()=>{setResources(null);setResourceError('');if(!site||embedded)return;let cancelled=false;void call<PageResources>({type:'GET_PAGE_RESOURCES',requestId:rid()}).then(data=>{if(!cancelled)setResources(data);}).catch(()=>{if(!cancelled)setResourceError('页面资源暂不可读取，请在目标网页重新打开侧栏。');});return()=>{cancelled=true;};},[site?.tabId,site?.url,embedded,resourceRevision]);
  const [records, setRecords] = useState<ScriptRecord[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceRecord|null>(null);
  const [record, setRecord] = useState<ScriptRecord|null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const [selectors, setSelectors] = useState<string[]>([]);
  const [target, setTarget] = useState<TargetElement|null>(null);
  const [picking, setPicking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stream, setStream] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [envelope, setEnvelope] = useState<GenerationEnvelope|null>(null);
  const [executor,setExecutor]=useState('provider');
  useEffect(()=>{void(async()=>{const value=(await executorStorage.get(currentExecutorKey))[currentExecutorKey]??(await chrome.storage.local.get('luban:v3:executor'))['luban:v3:executor'];setExecutor(value==='codex'?'codex':'provider');})().catch(fail);},[]);
  const [autoDiagnostics,setAutoDiagnostics]=useState('');
  const [exportArtifact,setExportArtifact]=useState<ExportArtifact|null>(null);
  const [runtimeIssues,setRuntimeIssues]=useState<RuntimeStatus[]>([]);
  const [runtimeStatus,setRuntimeStatus]=useState<RuntimeStatus|null>(null);
  const [deleteConfirm,setDeleteConfirm]=useState(false);
  const [receipt, setReceipt] = useState<TrialReceipt|null>(null);
  const [name, setName] = useState('');
  const [versionBusy, setVersionBusy] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [leaving, setLeaving] = useState<null | (()=>void)>(null);
  const wsRef = useRef<WorkspaceRecord|null>(null);
  const buffer = useRef<DraftBuffer|null>(null);
  const creating = useRef<Promise<WorkspaceRecord>|null>(null);
  const port = useRef<chrome.runtime.Port|null>(null);
  const pickerId = useRef('');
  const activeGeneration = useRef('');
  const selected = useRef(0);
  const busy = useRef(false);
  const dialogRef = useRef<HTMLDialogElement|null>(null);
  inputRef.current=input;
  const harness=useHarnessChat({onHistory:next=>setMessages(old=>old.length===next.length&&old.at(-1)?.text===next.at(-1)?.text&&old.at(-1)?.createdAt===next.at(-1)?.createdAt?old:next),enabled:agentEnabled&&!embedded&&view!=='library',workspaceId:workspace?.id??null,ensureWorkspace:async()=>{const ws=await ensureWorkspace();await flush();return wsRef.current??ws;},onArtifact:async id=>{const epoch=selected.current;if(wsRef.current?.id!==id)return;await loadWorkspace(id,epoch);if(selected.current!==epoch||wsRef.current?.id!==id)return;setReceipt(null);setView('editor');setArtifactOpen(true);setNotice('候选已检查并应用到当前草稿。请单独确认运行，效果符合后保存。');}});
  const timeline=agentEnabled?conversationTimeline(messages,harness.conversation):messages;
  const editable = !harness.busy && !generating && !preparing && !versionBusy && !analysing && !previewBusy && !thinkingSaving;
  const mismatch = !!workspace && (!site || workspace.host !== site.host);
  const effective = workspace?.draft ?? record?.current;
  const stage=workspaceStage({generating,stream,operation,preview:!!envelope,receipt:!!receipt,draft:!!workspace?.draft,failed:workflow.outcome?.state==='failed'});

  const fail = (e: unknown) => setNotice(e instanceof Error ? e.message : String(e));
  async function refreshSite() {
    try { const next=await call<Site>({ type:'GET_CURRENT_SITE', requestId:rid() });setSite(next);setSiteError('');
      if(agentEnabled&&!restoreAttempted.current&&!wsRef.current){restoreAttempted.current=true;const epoch=selected.current;try{const restored=(await executorStorage.get(chatWorkspaceKey))[chatWorkspaceKey];const list=await call<WorkspaceRecord[]>({type:'LIST_WORKSPACES',requestId:rid()});const candidate=typeof restored==='string'?list.find(w=>w.id===restored&&w.host===next.host):list.filter(w=>w.host===next.host&&w.panelScope?.endsWith(':'+next.tabId)&&(w.draft||w.input||w.scriptId)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];if(candidate&&!wsRef.current&&!creating.current&&selected.current===epoch)await loadWorkspace(candidate.id);}catch{/* A missing old workspace does not revoke access to the current page. */}}
    }
    catch(e) { setSite(null);setSiteError(e instanceof Error?e.message:'无法读取当前网页，请在目标网页重新打开侧栏。'); }
  }
  async function refreshLists() {
    const list = await call<ScriptMeta[]>({type:'LIST_SCRIPTS',requestId:rid()});
    const loaded = await Promise.all(list.map(meta=>call<ScriptRecord>({type:'GET_SCRIPT_RECORD',requestId:rid(),scriptId:meta.id})));
    setRecords(loaded.filter(Boolean));
    setRuntimeIssues((await call<RuntimeStatus[]>({type:'LIST_RUNTIME_STATUS',requestId:rid()})).filter(r=>['unavailable','cleanup_required','error'].includes(r.state)));
  }
  function attach(ws: WorkspaceRecord) {
    buffer.current?.dispose(); wsRef.current=ws; setWorkspace(ws);
    if(agentEnabled)void executorStorage.set({[chatWorkspaceKey]:ws.id}).catch(()=>{});
    buffer.current = new DraftBuffer(ws.draftRevision, async (revision,patch)=>{
      const saved = await call<WorkspaceRecord>({type:'SAVE_DRAFT',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:revision,patch});
      if(wsRef.current?.id===saved.id){wsRef.current=saved;setWorkspace(saved);}return saved;
    },fail);
  }
  useEffect(()=>{
    const listener=(message:{type?:string;workspaceId?:string;receipt?:TrialReceipt},sender:chrome.runtime.MessageSender)=>{
      if(message.type!=='V3_WORKSPACE_CHANGED'||typeof message.workspaceId!=='string'||sender.id!==chrome.runtime.id||sender.tab||message.workspaceId!==wsRef.current?.id)return;
      if(buffer.current?.hasPendingChanges||busy.current){setNotice('外部任务更新了工作区；当前未提交输入仍保留，请先处理版本冲突。');return;}
      void loadWorkspace(message.workspaceId).then(()=>{if(message.receipt&&wsRef.current?.id===message.workspaceId)setReceipt(message.receipt);setNotice(message.receipt?'外部试运行已完成，请检查页面效果后保存。':'收到外部候选，请检查代码并确认试运行。');}).catch(fail);
    };
    chrome.runtime.onMessage.addListener(listener);return()=>chrome.runtime.onMessage.removeListener(listener);
  },[]);
  async function loadWorkspace(id: string, epoch=selected.current) {
    const opened = await call<Opened>({type:'GET_WORKSPACE',requestId:rid(),workspaceId:id});
    if(epoch!==selected.current)return;
    if(!opened.workspace)throw Error('工作区已不存在，请重新打开。');
    const saved = opened.workspace.scriptId ? await call<ScriptRecord>({type:'GET_SCRIPT_RECORD',requestId:rid(),scriptId:opened.workspace.scriptId}) : null;
    const runtime=saved?await call<RuntimeStatus>({type:'GET_RUNTIME_STATUS',requestId:rid(),scriptId:saved.id}):null;
    if(epoch!==selected.current)return;
    const flow=await call<Workflow>({type:'GET_WORKFLOW',requestId:rid(),workspaceId:id});if(epoch!==selected.current)return;setWorkflow(flow);setConstraints(flow.constraints);setQuality(null);
    attach(opened.workspace);setRecord(saved);setRuntimeStatus(runtime);setAutoDiagnostics('');setMessages(opened.messages);setInput(opened.workspace.input);setReference(opened.workspace.codeReference??null);
    setCode((opened.workspace.draft??saved?.current)?.code??'');setName(saved?.name??opened.messages.filter(m=>m.role==='user').at(-1)?.text.replace(/\s+/g,' ').slice(0,24)??'网页工具');setReceipt(null);
  }
  async function ensureWorkspace(): Promise<WorkspaceRecord> {
    if(wsRef.current)return wsRef.current;
    if(!site)throw Error('请切回目标网页并点击鲁班图标授权。');
    if(!creating.current)creating.current=call<WorkspaceRecord>({type:'CREATE_WORKSPACE',requestId:rid(),scriptId:null,host:site.host});
    try {const ws=await creating.current;if(!wsRef.current)attach(ws);return ws;}
    finally{creating.current=null;}
  }
  function schedule(patch: DraftPatch) { setEnvelope(null); buffer.current?.schedule(patch); }
  function inputChanged(value: string) {
    cancelAnalysis();setInput(value);setEnvelope(null);setReceipt(null);
    if(pagePreview.current){pagePreviewInput.current=value;return;}
    void ensureWorkspace().then(()=>buffer.current?.schedule({input:value})).catch(fail);
  }
  async function closePagePreview(){
    const current=pagePreview.current;if(!current)return;
    await call({type:'CLOSE_CODE_PREVIEW',requestId:rid(),sessionId:current.sessionId});
    pagePreview.current=null;const text=pagePreviewInput.current;pagePreviewInput.current=null;if(text!==null)inputChanged(text);
  }
  async function openCode(){
    if(!editable||!effective)return;setPreviewBusy(true);
    try{await flush();await closePagePreview();await flush();const ws=wsRef.current!;
      const result=await call<{sessionId:string}>({type:'OPEN_CODE_PREVIEW',requestId:rid(),workspaceId:ws.id,name:name||'当前脚本'});pagePreview.current={sessionId:result.sessionId,workspaceId:ws.id};setNotice('代码已在左侧网页打开，聊天仍可继续。');
    }catch(e){if(pagePreview.current){fail(e);return;}setArtifactOpen(true);setNotice('网页浮层不可用，已回退到侧栏预览。'+(e instanceof Error?e.message:String(e)));}finally{setPreviewBusy(false);}
  }
  async function flush() { if(creating.current)await creating.current;await buffer.current?.flush(); }
  function resetActive() {
    cancelAnalysis();
    setReference(null);setArtifactOpen(false);setContextOpen(false);setSettingsOpen(false);queued.current='';setQueuedText('');
    setReasoningStages([]);setAnalysisReasoning([]);setWorkflow(emptyWorkflow());setConstraints('');setQuality(null);setFeedbackMode(false);
    setAutoDiagnostics('');setDeleteConfirm(false);setRuntimeStatus(null);setReceipt(null);setRestoreConfirm(false);selected.current++;buffer.current?.dispose();buffer.current=null;wsRef.current=null;setWorkspace(null);setRecord(null);setMessages([]);
    if(agentEnabled){restoreAttempted.current=true;void executorStorage.remove(chatWorkspaceKey).catch(()=>{});}
    setInput('');setCode('');setTarget(null);setSelectors([]);setEnvelope(null);setNotice('');
  }
  async function leave(action: ()=>void) {
    if(busy.current||harness.busy){setNotice('请先停止处理或等待操作完成。');return;}
    try {await closePagePreview();await flush();}catch(e){fail(e);return;}
    if(wsRef.current && (wsRef.current.draft || wsRef.current.input)){setLeaving(()=>action);return;}
    resetActive();action();
  }
  async function decideLeave(discard=false) {
    const action=leaving;if(!action)return;
    try{
      if(discard&&wsRef.current)await call({type:'DISCARD_DRAFT',requestId:rid(),workspaceId:wsRef.current.id,expectedDraftRevision:wsRef.current.draftRevision});
      else await flush();
      setLeaving(null);resetActive();action();await refreshLists();
    }catch(e){fail(e);}
  }
  async function openTool(s: ScriptRecord) {
    await leave(()=>{setView('editor');const epoch=selected.current;void (async()=>{
      const all=await call<WorkspaceRecord[]>({type:'LIST_WORKSPACES',requestId:rid()});
      const old=all.filter(w=>w.scriptId===s.id).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
      const ws=old??await call<WorkspaceRecord>({type:'CREATE_WORKSPACE',requestId:rid(),scriptId:s.id,host:s.host});
      await loadWorkspace(ws.id,epoch);
    })().catch(fail);});
  }
  async function prepare(allowRepair=repairAllowed,autoSend=true) {
    if(busy.current)return;busy.current=true;setPreparing(true);setNotice('');
    try{
      await closePagePreview();await ensureWorkspace();await flush();
      if(constraints!==workflow.constraints)await changeWorkflow({constraints});
      if(feedbackMode){await changeWorkflow({feedback:input});setFeedbackMode(false);}
      if(workflow.scope==='module'&&!workflow.strategyConfirmed){setNotice('请先确认目标模块策略。');return;}
      const ws=wsRef.current!;
      const result=await call<GenerationEnvelope>({type:'PREPARE_GENERATION',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision,selectors:selectors.length?selectors:undefined,repairAllowed:allowRepair});
      setView('editor');
      if(autoSend){busy.current=false;setPreparing(false);await generate(result);}
      else setEnvelope(result);
    }catch(e){fail(e);}finally{if(!activeGeneration.current)busy.current=false;setPreparing(false);}
  }
  async function generate(preview=envelope) {
    if(!preview||busy.current||!wsRef.current)return;busy.current=true;
    queued.current='';setQueuedText('');setReceipt(null);
    setActiveScriptAttachment(preview.scriptAttachment);setReasoningStages([]);setGenerating(true);setEnvelope(null);setStream('');setNotice('');
    const id=rid(),wsId=wsRef.current.id;activeGeneration.current=id;
    let finished=false;
    let connection: chrome.runtime.Port;
    try { connection=chrome.runtime.connect({name:PORT_NAMES.GENERATION});port.current=connection; }
    catch(e){activeGeneration.current='';busy.current=false;setGenerating(false);fail(e);return;}
    const complete = async (error?:string) => {
      if(activeGeneration.current!==id)return;finished=true;activeGeneration.current='';
      try{await loadWorkspace(wsId);await refreshLists();}catch(e){fail(e);}finally{if(queued.current){const text=queued.current;queued.current='';setQueuedText('');inputChanged(text);}busy.current=false;setGenerating(false);setStream('');}
      if(error)setNotice(error);
      connection.disconnect();
    };
    connection.onMessage.addListener((m:LubanMessage)=>{
      if(m.requestId!==id||activeGeneration.current!==id)return;
      if(m.type==='GENERATION_REASONING')setReasoningStages(old=>{const next=[...old];next[m.attempt-1]={attempt:m.attempt,text:m.content,truncated:m.truncated};return next.filter(Boolean);});
      if(m.type==='GENERATION_PROGRESS')setStream(m.content);
      if(m.type==='GENERATION_COMPLETE')void complete();
      if(m.type==='GENERATION_FAILED')void complete(m.error.message);
    });
    connection.onDisconnect.addListener(()=>{if(port.current===connection)port.current=null;if(!finished&&activeGeneration.current===id)void complete('生成连接中断，原草稿仍保留；可重新打开后重试。');});
    try{connection.postMessage({type:'GENERATE_WORKSPACE',requestId:id,workspaceId:wsId,envelopeId:preview.id});}catch(e){void complete(String(e));}
  }
  async function cancel() {
    if(!wsRef.current)return;
    setNotice('已请求停止，正在等待执行方确认…');
    try{await call({type:'CANCEL_WORKSPACE_GENERATION',requestId:rid(),workspaceId:wsRef.current.id});activeGeneration.current='';port.current?.disconnect();port.current=null;
      try{await loadWorkspace(wsRef.current.id);}finally{if(queued.current){const text=queued.current;queued.current='';setQueuedText('');inputChanged(text);}busy.current=false;setGenerating(false);setStream('');}setNotice('生成已取消，需求和原草稿已保留。');
    }catch(e){fail(e);}
  }
  async function pick() {
    try{await closePagePreview();await ensureWorkspace();await flush();setPicking(true);pickerId.current=rid();
      await call({type:'START_PICKER',requestId:pickerId.current});
    }catch(e){setPicking(false);fail(e);}
  }
  async function clearPick() {if(wsRef.current)await changeWorkflow({scope:'page',selectors:[]});await call({type:'V21_CLEAR_PREVIEW',requestId:rid()}).catch(()=>{});pickerId.current='';setPicking(false);setTarget(null);setSelectors([]);setEnvelope(null);await call({type:'CANCEL_PICKER',requestId:rid()}).catch(fail);}
  function editCode(value: string) {
    if(!wsRef.current||!effective)return;
    cancelAnalysis();setQuality(null);setWorkflow(old=>{const next={...old};delete next.quality;return next;});setReceipt(null);setCode(value);
    schedule({draft:{...effective,versionId:crypto.randomUUID(),hash:'unverified-edit',code:value,explanation:'代码已手动修改，请检查实际代码并重新试运行。'}});
  }
  async function editGrant(grant: string, enabled: boolean) {
    if(busy.current)return;
    busy.current=true;setVersionBusy(true);setQuality(null);setWorkflow(old=>{const next={...old};delete next.quality;return next;});setReceipt(null);
    try {
      await flush();
      const current=wsRef.current?.draft??record?.current;
      if(!current)return;
      const grants=enabled?[...new Set([...current.grants,grant])]:current.grants.filter(g=>g!==grant);
      schedule({draft:{...current,code,grants,versionId:crypto.randomUUID(),hash:'unverified-edit'}});
      await flush();
      setNotice('草稿权限已更新，请重新试运行后保存。');
    }catch(e){fail(e);}finally{busy.current=false;setVersionBusy(false);setOperation(null);}
  }
  useEffect(()=>{
    void getSettings().then(s=>{setThinkingSupported(thinkingProtocol(toProviderConfig(s,''))==='thinking');setProviderName((s.customEndpoint?s.customModel:s.defaultModel)||'第三方模型');setAnalysisEnabled(!!s.pageAnalysisEnabled);setThinkingEnabled(s.thinkingEnabled!==false);});
    void refreshSite();void refreshLists().catch(fail);
    const updateSite=()=>{void closePagePreview().catch(fail);cancelAnalysis();setReceipt(null);if(activeGeneration.current)void cancel();setEnvelope(null);setSelectors([]);setTarget(null);void refreshSite();};
    const changed=(id:number,change:{url?:string})=>{if(change.url&&(boundTabId===undefined||id===boundTabId))updateSite();};
    const activated=(info:{tabId:number})=>{if(boundTabId===undefined)updateSite();else if(info?.tabId===boundTabId)void refreshSite();};
    const checkAccess=()=>{void refreshSite();};
    window.addEventListener('focus',checkAccess);
    const on=()=>setOnline(true),off=()=>setOnline(false);
    chrome.tabs.onActivated?.addListener(activated);chrome.tabs.onUpdated?.addListener(changed);
    const settingsChanged=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{if(area==='sync'&&changes[STORAGE_KEYS.SETTINGS]){const settings=changes[STORAGE_KEYS.SETTINGS].newValue;void getSettings().then(s=>setThinkingSupported(thinkingProtocol(toProviderConfig(s,''))==='thinking')).catch(fail);setProviderName((settings?.customEndpoint?settings.customModel:settings?.defaultModel)||'第三方模型');setThinkingEnabled(settings?.thinkingEnabled!==false);setEnvelope(null);cancelAnalysis();}};
    chrome.storage.onChanged?.addListener(settingsChanged);
    window.addEventListener('online',on);window.addEventListener('offline',off);
    return()=>{window.removeEventListener('focus',checkAccess);chrome.storage.onChanged?.removeListener(settingsChanged);chrome.tabs.onActivated?.removeListener(activated);chrome.tabs.onUpdated?.removeListener(changed);window.removeEventListener('online',on);window.removeEventListener('offline',off);buffer.current?.dispose();port.current?.disconnect();cancelAnalysis();};
  },[]);
  useEffect(()=>{
    const onMessage=(m:LubanMessage,sender:chrome.runtime.MessageSender)=>{
      if(m.type==='ELEMENT_PICKED'&&m.requestId===pickerId.current&&sender.id===chrome.runtime.id&&sender.frameId===0&&sender.tab?.id===site?.tabId){setReceipt(null);setTarget(m.context.target);void changeWorkflow({scope:'element',selectors:m.context.target?.selectorCandidates??[]}).catch(fail);setSelectors(m.context.target?.selectorCandidates??[]);setEnvelope(null);setPicking(false);}
      if(m.type==='PICK_CANCELLED'&&sender.id===chrome.runtime.id&&sender.frameId===0&&sender.tab?.id===site?.tabId){setPicking(false);pickerId.current='';}
    };
    chrome.runtime.onMessage.addListener(onMessage);return()=>chrome.runtime.onMessage.removeListener(onMessage);
  },[site?.tabId]);
  useLayoutEffect(()=>{const escape=(e:KeyboardEvent)=>{
    if(e.key!=='Escape'||e.isComposing||e.defaultPrevented)return;
    if(picking){e.preventDefault();void clearPick();}
    else if(pagePreview.current){e.preventDefault();void closePagePreview().then(()=>document.querySelector<HTMLButtonElement>('.chat-artifact-name')?.focus()).catch(fail);}
  };window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);});
  useEffect(()=>{if(leaving&&!dialogRef.current?.open)dialogRef.current?.showModal();else if(!leaving&&dialogRef.current?.open)dialogRef.current.close();},[leaving]);

  async function versionAction(action: 'trial'|'save'|'restore'|'rename') {
    if(busy.current||!wsRef.current)return;busy.current=true;setOperation(action);setVersionBusy(true);setNotice('');
    try {
      await closePagePreview();await flush();const ws=wsRef.current!;
      if(action==='trial'){
        setReceipt(null);
        const response=await call<{result:TrialResult;receipt:TrialReceipt|null}>({type:'TRIAL_DRAFT',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision});
        await loadWorkspace(ws.id);setName(name);setReceipt(response.receipt);if(agentEnabled&&response.receipt)await harness.act('check');
        setNotice(response.receipt?(response.result.repeated?'同一内容已在本页执行，未重复运行。请检查页面效果。':'执行完成，请检查页面效果；尚未保存。'):(response.result.error??'试运行未完成，请检查代码。'));
      } else if(action==='save'){
        if(!receipt)throw Error('请先试运行。');
        const saved=await call<ScriptRecord>({type:'COMMIT_DRAFT',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision,receiptId:receipt.id,name,opId:rid(),effectAcknowledged:true});
        await loadWorkspace(ws.id);await refreshLists();setNotice(saved.autoRun.desired?'已保存，后续新开网页运行此版本。':'已保存，自动运行关闭。');
      } else if(action==='restore'){
        if(!record)return;
        await call({type:'RESTORE_PREVIOUS',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision,expectedRevision:record.recordRevision,discardDraft:true,opId:rid()});
        setRestoreConfirm(false);await loadWorkspace(ws.id);await refreshLists();setNotice('已恢复上一版。请刷新网页查看效果，已产生的页面变化不会即时撤销。');
      } else {
        if(!record)return;
        await call({type:'RENAME_SCRIPT',requestId:rid(),scriptId:record.id,expectedRevision:record.recordRevision,name});
        setRecord(await call<ScriptRecord>({type:'GET_SCRIPT_RECORD',requestId:rid(),scriptId:record.id}));await refreshLists();const updated=await call<Opened>({type:'GET_WORKSPACE',requestId:rid(),workspaceId:ws.id});attach(updated.workspace);setNotice('名称已更新，不轮换上一版。');
      }
    } catch(e){fail(e);} finally {busy.current=false;setVersionBusy(false);}
  }
  async function toggleAuto(targetRecord=record){
    if(!targetRecord||busy.current)return;busy.current=true;setVersionBusy(true);setNotice('');
    try{
      const enabled=!targetRecord.autoRun.desired;
      if(enabled){if(!targetRecord.host)throw Error('请先确认适用网站。');const granted=await chrome.permissions.request({origins:hostPermissionOrigins(targetRecord.host)});if(!granted)throw Error('网站授权被拒绝，工具仍已保存，自动运行未开启。');}
      await flush();await call({type:'SET_AUTO_RUN',requestId:rid(),scriptId:targetRecord.id,expectedRevision:targetRecord.recordRevision,enabled});
      if(wsRef.current?.scriptId===targetRecord.id)await loadWorkspace(wsRef.current.id);await refreshLists();setNotice(enabled?'自动运行已开启。新开匹配网站验证，无需点击图标；已打开页面请刷新。':'自动运行已关闭。已打开页面的效果可能仍在，请刷新。');
    }catch(e){if(wsRef.current?.scriptId===targetRecord.id)await loadWorkspace(wsRef.current.id).catch(()=>{});await refreshLists().catch(()=>{});fail(String(e).includes('Only permissions specified in the manifest')?new Error('网站权限声明未生效。请在 Chrome 扩展管理页重新加载最新 luban/dist，再开启；可查看自动运行诊断核对实际权限声明。'):e);}finally{busy.current=false;setVersionBusy(false);setOperation(null);}
  }
  async function retryAuto(){try{await call({type:'RETRY_AUTO_RUN',requestId:rid()});if(wsRef.current)await loadWorkspace(wsRef.current.id);await refreshLists();const issues=(await call<RuntimeStatus[]>({type:'LIST_RUNTIME_STATUS',requestId:rid()})).filter(r=>['unavailable','cleanup_required','error'].includes(r.state));setNotice(issues.length?'仍有运行问题，请查看提示并重试。':'已重新核对注册，请查看运行状态。');}catch(e){fail(e);}}
  async function deleteTool(){if(!record||busy.current)return;busy.current=true;setVersionBusy(true);try{await flush();await call({type:'DELETE_SCRIPT',requestId:rid(),scriptId:record.id});resetActive();setView('home');await refreshLists();setNotice('工具已删除。已打开页面的效果需刷新。');}catch(e){setDeleteConfirm(false);if(wsRef.current)await loadWorkspace(wsRef.current.id).catch(()=>{});await refreshLists().catch(()=>{});fail(e);}finally{busy.current=false;setVersionBusy(false);setOperation(null);}}
  async function exportTool(targetRecord:ScriptRecord){
    try{await flush();const artifact=await call<ExportArtifact>({type:'EXPORT_CURRENT',requestId:rid(),scriptId:targetRecord.id});setExportArtifact(artifact);}catch(e){fail(e);}
  }
  async function runSaved(targetRecord:ScriptRecord){
    if(busy.current)return;busy.current=true;setVersionBusy(true);try{const result=await call<InjectionResult>({type:'RUN_SAVED_SCRIPT',requestId:rid(),scriptId:targetRecord.id});setNotice(result.scriptError??result.error??'执行完成，请检查页面效果。相同内容重复运行需刷新页面。');}catch(e){fail(e);}finally{busy.current=false;setVersionBusy(false);setOperation(null);}
  }
  async function deleteFromLibrary(targetRecord:ScriptRecord){
    if(!window.confirm(`删除“${targetRecord.name}”及其草稿、对话和 GM 数据？无法撤销，已打开页面的效果需刷新。`))return;
    try{await call({type:'DELETE_SCRIPT',requestId:rid(),scriptId:targetRecord.id});await refreshLists();setNotice('工具已删除，请刷新已运行的网页。');}catch(e){await refreshLists().catch(()=>{});fail(e);}
  }
  async function changeWorkflow(patch:{constraints?:string;trigger?:Workflow['trigger'];expectedEffect?:string;feedback?:string;selectors?:string[];scope?:Workflow['scope'];confirmStrategy?:boolean}){
    await closePagePreview();await ensureWorkspace();await flush();const ws=wsRef.current!;
    const r=await call<{workspace:WorkspaceRecord;workflow:Workflow}>({type:'UPDATE_WORKFLOW',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision,...patch});
    attach(r.workspace);setWorkflow(r.workflow);setEnvelope(null);setReceipt(null);setQuality(null);
    if(patch.feedback!==undefined)setInput(patch.feedback);
  }
  async function selectTarget(c:TargetCandidate,scope:'element'|'module'){
    try{await changeWorkflow({selectors:[c.selector],scope});setSelectors([c.selector]);}catch(e){fail(e);}
  }
  async function previewTarget(){
    try{if(!workflow.targetFingerprint)return;const result=await call<{ok:boolean;error?:string}>({type:'V21_PREVIEW_TARGET',requestId:rid(),selectors:workflow.selectors,fingerprint:workflow.targetFingerprint});if(!result.ok)throw Error(result.error);setNotice('只读范围预览已显示，Esc 可清除。');}catch(e){fail(e);}
  }
  async function prepareManualRepair(){
    if(agentEnabled){inputChanged('请先分析当前草稿的基础检查问题，保留原功能，和我确认修复方案后再生成。');return;}
    if(busy.current)return;
    try{await ensureWorkspace();await flush();const value='修复当前代码的基础检查错误，保持目标、触发方式、权限与其他功能不变。返回完整代码；不要扩大范围。';setInput(value);setFeedbackMode(false);buffer.current?.schedule({input:value});await flush();await prepare(false);}catch(e){fail(e);}
  }
  async function checkDraft(){try{await flush();const ws=wsRef.current!;setQuality(await call<QualityReport>({type:'CHECK_DRAFT',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision}));}catch(e){fail(e);}}
  async function editFailure(){try{await flush();const ws=wsRef.current!;await call({type:'EDIT_FAILURE',requestId:rid(),workspaceId:ws.id,expectedDraftRevision:ws.draftRevision});await loadWorkspace(ws.id);}catch(e){fail(e);}}
  function feedback(text:string){setFeedbackMode(true);setReceipt(null);inputChanged(text);setNotice('反馈未发送。补充目标范围后，查看发送内容继续修改。');setTimeout(()=>document.querySelector<HTMLTextAreaElement>('#intent')?.focus(),0);}
  function cancelAnalysis() {
    analysisEpoch.current++;const id=analysisId.current;analysisId.current='';
    if(id)void call({type:'CANCEL_PAGE_ANALYSIS',requestId:rid(),previewId:id}).catch(()=>{});
    setAnalysisPreview(null);setSuggestions([]);setAnalysing(false);
  }
  async function prepareAnalysis(){
    if(busy.current)return;cancelAnalysis();setAnalysisReasoning([]);const epoch=analysisEpoch.current;
    busy.current=true;setPreparing(true);
    try{await flush();const preview=await call<AnalysisPreview>({type:'PREPARE_PAGE_ANALYSIS',requestId:rid()});
      if(epoch!==analysisEpoch.current){void call({type:'CANCEL_PAGE_ANALYSIS',requestId:rid(),previewId:preview.id});return;}
      analysisId.current=preview.id;setAnalysisPreview(preview);
    }catch(e){if(epoch===analysisEpoch.current)fail(e);}finally{busy.current=false;setPreparing(false);}
  }
  async function runAnalysis(){
    if(!analysisPreview||busy.current)return;
    const epoch=analysisEpoch.current,id=analysisPreview.id;setAnalysing(true);
    try{const list=await call<PageSuggestion[]>({type:'RUN_PAGE_ANALYSIS',requestId:rid(),previewId:id});
      if(epoch!==analysisEpoch.current)return;setSuggestions(list);setAnalysisPreview(null);setNotice(list.length?'选择建议后可编辑需求，再预览并生成。':'没有适合当前页面的建议。');
    }catch(e){if(epoch===analysisEpoch.current)fail(e);}finally{if(epoch===analysisEpoch.current){analysisId.current='';setAnalysing(false);setAnalysisPreview(null);if(queued.current){const text=queued.current;queued.current='';setQueuedText('');inputChanged(text);}}}
  }
  useEffect(()=>{
    const listener=(m:LubanMessage,sender:chrome.runtime.MessageSender,respond:(r:unknown)=>void)=>{
      if(m.type==='ANALYSIS_REASONING'&&sender.id===chrome.runtime.id&&!sender.tab&&m.requestId===analysisId.current){setAnalysisReasoning([{attempt:1,text:m.content,truncated:m.truncated}]);respond({ok:true});return;}

      if(m.type!=='CODE_PREVIEW_UPDATED'||sender.id!==chrome.runtime.id||sender.tab||m.sessionId!==pagePreview.current?.sessionId||m.workspaceId!==wsRef.current?.id)return;
      void (async()=>{setPreviewBusy(true);try{
        if(m.action==='close'||m.action==='more'){pagePreview.current=null;const text=pagePreviewInput.current;pagePreviewInput.current=null;if(text!==null)inputChanged(text);if(m.action==='more')setArtifactOpen(true);if(previewFocusChat.current){previewFocusChat.current=false;setTimeout(()=>document.querySelector<HTMLTextAreaElement>('#intent')?.focus(),0);}else if(m.action==='close'){setTimeout(()=>document.querySelector<HTMLButtonElement>('.chat-artifact-name')?.focus(),0);}}
        else if(m.action==='name')setName(m.name);
        else{const oldReceipt=receipt;await loadWorkspace(m.workspaceId);setName(name);if(pagePreviewInput.current!==null)setInput(pagePreviewInput.current);if(m.action==='reference'){setReceipt(oldReceipt);previewFocusChat.current=true;}else{setReceipt(null);setNotice('代码已修改为未验证草稿，请重新检查并试运行。');}}
        respond({ok:true});
      }catch(e){fail(e);respond({ok:false});}finally{setPreviewBusy(false);}})();return true;
    };
    chrome.runtime.onMessage.addListener(listener);return()=>chrome.runtime.onMessage.removeListener(listener);
  });
  async function addCodeReference(version:NonNullable<typeof effective>,lines:number[]){
    await ensureWorkspace();await flush();const ws=wsRef.current!;
    const ref=await createReference(ws.id,version,name||record?.name||'当前脚本',lines);
    schedule({codeReference:ref});await flush();setReference(ref);
    setTimeout(()=>document.querySelector<HTMLTextAreaElement>('#intent')?.focus(),0);
  }
  function removeReference(){void closePagePreview().then(()=>{setReference(null);schedule({codeReference:null});}).catch(fail);}
  async function keepCode(value:string){editCode(value);await flush();}
  function chatInput(value:string){if(generating||analysing){queued.current=value;setQueuedText(value);}else inputChanged(value);}
  async function toggleThinking(enabled:boolean){setThinkingSaving(true);try{await saveThinkingEnabled(enabled);setThinkingEnabled(enabled);setEnvelope(null);cancelAnalysis();}catch(e){fail(e);}finally{setThinkingSaving(false);}}
  async function sendChat(){if(thinkingSaving||previewBusy)return;if(agentEnabled){if(embedded){setNotice('请在目标网页的鲁班侧栏继续对话；脚本与草稿保留。');return;}if(harness.active){await harness.cancel();return;}if(harness.working||!input.trim())return;const sent=input;const ok=await harness.send(sent.trim());if(ok&&inputRef.current===sent){inputChanged('');await flush();}return;}if(generating){await cancel();return;}if(analysing){cancelAnalysis();if(queued.current){const text=queued.current;queued.current='';setQueuedText('');inputChanged(text);}return;}await prepare(repairAllowed,true);}
  function latest(){follow.current=true;setShowLatest(false);if(chatScroll.current)chatScroll.current.scrollTop=chatScroll.current.scrollHeight;}
  useEffect(()=>{if(follow.current&&chatScroll.current)chatScroll.current.scrollTop=chatScroll.current.scrollHeight;},[messages,stream,reasoningStages,analysisReasoning,notice,suggestions,envelope,workflow]);
  const streamingExplanation=(()=>{const match=stream.match(/"explanation"\s*:\s*"((?:\\.|[^"\\])*)/);if(!match)return '';try{return JSON.parse('"'+match[1]+'"') as string;}catch{return '';}})();
  const artifactTools=<>
    <details><summary>草稿 GM 权限</summary><fieldset disabled={!editable}>{GM_P0_GRANTS.map(grant=><label class="chat-permission"><input type="checkbox" checked={effective?.grants.includes(grant)??false} onChange={e=>void editGrant(grant,e.currentTarget.checked)}/>{grant}</label>)}</fieldset></details>
    {workspace?.draft||workflow.failure?<QualityCard workflow={workflow} quality={quality} busy={!editable} onCheck={()=>void checkDraft()} onEditFailure={()=>void editFailure()} onRepair={()=>void prepareManualRepair()}/>:null}
    {record?<><p class="p2-muted">自动运行：{runtimeStatus?.message??'关闭'} · {record.host}</p><div class="p2-row"><button disabled={!editable} onClick={()=>void toggleAuto()}>{record.autoRun.desired?'关闭自动运行':'授权并开启自动运行'}</button><button disabled={!editable} onClick={()=>void exportTool(record)}>导出保存版</button><button disabled={!editable} onClick={()=>void versionAction('rename')}>仅修改名称</button><button disabled={!editable||!record.previous} onClick={()=>setRestoreConfirm(true)}>恢复上一版</button><button disabled={!editable} onClick={()=>setDeleteConfirm(true)}>删除工具</button><button disabled={!editable||mismatch} onClick={()=>void runSaved(record)}>运行保存版</button><button disabled={!editable} onClick={()=>void retryAuto()}>重试注册</button><button onClick={()=>{void call({type:'GET_AUTO_DIAGNOSTICS',requestId:rid(),scriptId:record.id}).then(data=>setAutoDiagnostics(JSON.stringify(data,null,2))).catch(fail);}}>查看运行诊断</button></div>{autoDiagnostics?<pre>{autoDiagnostics}</pre>:null}</>:null}
    {restoreConfirm?<div role="alert"><p>恢复会放弃当前草稿；请刷新页面观察效果。</p><button onClick={()=>setRestoreConfirm(false)}>取消恢复</button><button disabled={!editable} onClick={()=>void versionAction('restore')}>确认恢复并放弃草稿</button></div>:null}
    {deleteConfirm?<div role="alert"><p>删除工具、草稿、对话与 GM 数据？无法撤销。</p><button onClick={()=>setDeleteConfirm(false)}>取消删除</button><button disabled={!editable} onClick={()=>void deleteTool()}>确认删除工具</button></div>:null}
  </>;

  return <div class={'panel p2-panel chat-app'+(embedded?' embedded':'')} data-workspace-stage={stage}>
    {!agentEnabled?<header class={'chat-top'+(embedded?'':' chat-top-compact')} aria-label="当前页面与工具操作"><div class="chat-page-context">{embedded?<strong class="chat-brand"><img src={brandLogo} alt="" width="26" height="26"/>鲁班 <small>Luban</small></strong>:null}<span title={site?.host}>{site?.host??'请打开并授权普通网页'}</span></div><div class="chat-top-actions"><button title="新建工具" aria-label="新建工具" disabled={!editable} onClick={()=>void leave(()=>setView('home'))}>＋</button><button disabled={!editable} onClick={()=>void leave(()=>{setView(view==='library'?'home':'library');void refreshLists().catch(fail);})}>{view==='library'?'返回聊天':'我的工具'}</button>{!agentEnabled?<button aria-label="分析此页面" title="分析此页面" disabled={!editable||!online||!site||mismatch||(!agentEnabled&&!analysisEnabled)} onClick={()=>agentEnabled?void harness.act('scan'):void prepareAnalysis()}>✳</button>:null}</div></header>:null}
    {view==='library'?<main class="chat-library"><ScriptLibrary records={records} activeHost={site?.host??null} busy={!editable} onOpen={r=>void openTool(r)} onRun={r=>void runSaved(r)} onToggle={r=>void toggleAuto(r)} onExport={r=>void exportTool(r)} onDelete={r=>void deleteFromLibrary(r)}/></main>:<>
    <div class="chat-messages" ref={chatScroll} aria-label="当前对话" onScroll={()=>{const el=chatScroll.current;if(!el)return;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<65;setShowLatest(!follow.current);}}>
      {!timeline.length&&!generating&&!harness.active?<PageResourceTree data={resources} error={resourceError} host={site?.host} onRefresh={()=>setResourceRevision(v=>v+1)}/>:null}
      {agentEnabled?<HarnessTranscript messages={timeline} controller={harness}/>:timeline.map((m,i)=><article key={i} class={'chat-message '+m.role}><ReasoningDetails stages={m.reasoning??[]} omitted={m.reasoningOmitted}/><ChatMarkdown text={m.text}/>{m.scriptAttachment?<div class="chat-file-history">📄 {m.scriptAttachment.filename} · {m.scriptAttachment.source==='draft'?'草稿':'保存版'} · {m.scriptAttachment.versionId.slice(0,8)}</div>:null}{m.codeReference?<details class="chat-reference-history"><summary>引用 {m.codeReference.name} · 版本 {m.codeReference.versionId.slice(0,8)} · {lineLabel(m.codeReference.lines)}</summary><pre>{m.codeReference.text}</pre></details>:null}</article>)}
      {agentEnabled?<HarnessCards controller={harness} onViewArtifact={()=>setArtifactOpen(true)}/>:null}
      {generating?<article class="chat-message user"><ChatMarkdown text={input}/>{activeScriptAttachment?<div class="chat-file-history">📄 {activeScriptAttachment.filename} · {activeScriptAttachment.source==='draft'?'草稿':'保存版'} · {activeScriptAttachment.versionId.slice(0,8)}</div>:null}{reference?<details><summary>引用 {reference.name} · 版本 {reference.versionId.slice(0,8)} · {lineLabel(reference.lines)}</summary><pre>{reference.text}</pre></details>:null}</article>:null}
      {preparing?<article class="chat-message assistant" aria-live="polite">正在准备本轮上下文…</article>:null}
      {generating?<article class="chat-message assistant" aria-live="polite"><ReasoningDetails stages={reasoningStages} live/><details><summary>{stage==='repairing'?'正在修复基础错误 · 1/1':stream.startsWith('模型正在推理')?'模型正在推理':'正在生成与检查脚本'}</summary><p>已确认本轮输入与发送范围；候选通过完整检查后才写入草稿。</p><p>完成后可查看检查结果与修改说明。</p></details>{streamingExplanation?<ChatMarkdown text={streamingExplanation}/>:<p class="chat-processing">处理中…已有保存版不变。</p>}</article>:null}
      {!generating&&reasoningStages.length&&!messages.at(-1)?.reasoning?<ReasoningDetails stages={reasoningStages}/>:null}
      {analysisReasoning.length?<article class="chat-message assistant"><small>页面分析</small><ReasoningDetails stages={analysisReasoning} live={analysing}/></article>:null}
      {notice?<article class="chat-message assistant" aria-live="polite"><ChatMarkdown text={notice}/>{receipt?<div class="chat-feedback">{['没有达到预期效果','处理范围过大','误伤了需要保留的内容'].map(t=><button onClick={()=>feedback(t)}>{t}</button>)}<button onClick={()=>feedback('')}>继续反馈</button><button onClick={()=>setNotice('草稿保留，请继续观察页面效果，不会自动保存。')}>继续观察</button></div>:null}</article>:null}
      {workflow.clarification?<article class="chat-message assistant"><strong>请先对齐需求</strong><ChatMarkdown text={workflow.clarification}/></article>:null}
      {workflow.scope==='module'&&!workflow.strategyConfirmed?<article class="chat-message assistant"><p>当前选择的是完整模块。请核对是否包含广告标签与占位，并保留正文和相邻内容。</p><button disabled={!editable} onClick={()=>void previewTarget()}>预览范围</button><button disabled={!editable} onClick={()=>{void changeWorkflow({confirmStrategy:true}).catch(fail);}}>确认当前范围</button></article>:null}
      {workflow.failure?<details class="chat-failure"><summary>本次候选未采纳 · 查看原因或编辑候选</summary><QualityCard workflow={workflow} quality={quality} busy={!editable} onCheck={()=>void checkDraft()} onEditFailure={()=>void editFailure()} onRepair={()=>void prepareManualRepair()}/></details>:null}
      {envelope?<article class="chat-message assistant chat-disclosure"><strong>本轮发送详情</strong><p>{envelope.provider.model} · {envelope.thinkingEnabled?'推理开启':'推理关闭'}{envelope.thinkingProtocol==='none'?'（端点使用服务端默认）':''} · 当前需求、代码及有限页面摘要。{envelope.repairAllowed===false?'最多 1 次请求。':'允许修复一次，最多 2 次请求。'}</p><p>这是按需预览；点击输入框发送会直接生成。</p><details><summary>实际发送详情</summary><pre>{JSON.stringify({provider:envelope.provider,messages:envelope.messages,retryMessages:envelope.retryMessages},null,2)}</pre></details><button onClick={()=>setEnvelope(null)}>返回修改</button><button class="p2-primary" disabled={!editable||!online} onClick={()=>void generate()}>发送并生成</button></article>:null}
      {analysisPreview?<article class="chat-message assistant"><strong>分析此页 · 发送确认</strong><p>{analysisPreview.thinkingEnabled?'推理开启':'推理关闭'}{analysisPreview.thinkingProtocol==='none'?'（端点使用服务端默认）':''}</p><p>仅发送页面摘要，返回建议，不生成或运行脚本。</p><details><summary>实际发送详情</summary><pre>{JSON.stringify(analysisPreview.messages,null,2)}</pre></details><button onClick={cancelAnalysis}>取消分析</button><button disabled={analysing||!online} onClick={()=>void runAnalysis()}>确认发送并分析</button></article>:null}
      {suggestions.length?<article class="chat-message assistant"><h3>可以从这里开始</h3>{suggestions.map(item=><button class="chat-suggestion" onClick={()=>{inputChanged(item.intent);setSuggestions([]);}}><strong>{item.title}</strong><span>{item.intent}</span></button>)}</article>:null}
      {mismatch?<p class="chat-warning">当前网站不匹配，生成与运行前请切回 {workspace?.host}。</p>:null}{!online?<p class="chat-warning">当前离线，本地查看与编辑仍可用。</p>:null}
      {runtimeIssues.length?<details><summary>有工具的运行或清理需要处理</summary>{runtimeIssues.map(issue=><p>{issue.message}</p>)}<button disabled={!editable} onClick={()=>void retryAuto()}>重试清理与注册</button></details>:null}
    </div>
    {showLatest?<button class="chat-latest" onClick={latest}>↓ 回到最新</button>:null}
    {!site?<div class="chat-warning" role="status">当前网页尚不可访问。{siteError||'请在目标网页点击工具栏的鲁班图标重新授权。'}<button onClick={()=>void refreshSite()}>重新检查页面</button>未发送输入会保留。</div>:null}
    {effective&&!agentEnabled?<section class="chat-artifact"><button class="chat-artifact-name" title="查看脚本制品" onClick={()=>void openCode()} disabled={!editable}><b>JS</b><span><strong>{scriptFilename(record?.name??'当前草稿')}</strong><small>{workspace?.draft?receipt?'已运行 · 待确认效果':workflow.quality?.passed?'已检查 · 待运行':'草稿 · 未验证':'保存版'} · 随消息发送 · 查看代码</small></span></button><button class={!receipt?'p2-primary':''} disabled={!editable||mismatch||!workspace?.draft||quality?.passed===false} onClick={()=>void versionAction('trial')}>运行</button><button class={receipt?'p2-primary':''} disabled={!editable||!receipt||!name.trim()} onClick={()=>void versionAction('save')}>{receipt?'效果符合，保存':'保存'}</button></section>:null}
    {!agentEnabled&&receipt&&<SendToFeishu summary={`鲁班试运行已完成，请核对页面效果。草稿版本：${receipt.draftRevision}；回执：${receipt.id}。工具尚需明确保存。`}/>}
    <footer class="chat-composer">

      {reference?<div class="chat-reference"><details><summary>{reference.name} · 版本 {reference.versionId.slice(0,8)} · {lineLabel(reference.lines)}{reference.versionId!==effective?.versionId?' · 历史快照':''}</summary><pre>{reference.text}</pre></details><button aria-label="移除代码引用" disabled={generating} onClick={removeReference}>×</button></div>:null}

      {!agentEnabled&&<div class="chat-context"><button onClick={()=>setContextOpen(!contextOpen)}>{workflow.scope==='page'?'◌ 当前页面':workflow.scope==='module'?'◎ 完整模块':'◎ 已点选元素'} ⌄</button>{target?<button aria-label="清除点选" disabled={!editable} onClick={()=>void clearPick()}>×</button>:null}<button onClick={()=>void prepare(repairAllowed,false)} disabled={!editable||!input.trim()||!online}>发送范围</button></div>}
      {!agentEnabled&&contextOpen?<div class="chat-context-details"><TargetCard workflow={workflow} candidates={target?.targetContext?.candidates??[]} busy={!editable} onSelect={(c,scope)=>void selectTarget(c,scope)} onPreview={()=>void previewTarget()} onConfirm={()=>{void changeWorkflow({confirmStrategy:true}).catch(fail);}} onTrigger={trigger=>{void changeWorkflow({trigger}).catch(fail);}} onEffect={expectedEffect=>{void changeWorkflow({expectedEffect}).catch(fail);}}/><label>保留范围<textarea aria-label="保留范围" value={constraints} disabled={!editable} onInput={e=>{setConstraints(e.currentTarget.value);setEnvelope(null);setReceipt(null);}}/></label></div>:null}
      {agentEnabled?<HarnessActions controller={harness} onClarify={()=>{if(!input.trim())inputChanged('本次识别范围是：');document.getElementById('intent')?.focus();}} disabled={embedded||!site||mismatch||versionBusy}/>:null}
      <div class="chat-input-shell"><textarea id="intent" aria-label="发送需求或继续反馈" rows={2} value={generating||analysing?queuedText:input} disabled={preparing||versionBusy} onInput={e=>chatInput(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();void sendChat();}}} placeholder="说说你想怎样调整这个页面…"/><div>{!agentEnabled?<button onClick={()=>void pick()} disabled={!editable||!site}>⌖ 点选元素</button>:null}<small>{generating?'可输入下一条需求':'Enter 发送 · Shift+Enter 换行'}</small><button class="chat-send" aria-label={harness.active?'停止处理':generating||analysing?'停止生成':'发送'} disabled={!(generating||analysing||harness.active)&&(!editable||!online||!input.trim()||mismatch||!site||(agentEnabled&&embedded))} onClick={()=>void sendChat()}>{generating||analysing||harness.active?'■':'↑'}</button></div></div>{!agentEnabled?<p>发送需求与有限摘要 · {thinkingEnabled?'推理已开启':'推理已关闭'} · {repairAllowed?'允许修复 1 次':'不追加自动修复'}</p>:null}

      <div class="chat-bottom-tools" role="group" aria-label="聊天配置">
        <ModelPicker value={executor} providerName={providerName} disabled={!editable||harness.busy} onOpen={()=>setSettingsOpen(false)} onChange={async value=>{await executorStorage.set({[currentExecutorKey]:value});setExecutor(value);setEnvelope(null);}}/>

        <div class="chat-bottom-preferences">
          <button type="button" role="switch" aria-label="Thinking 模式" aria-checked={executor!=='codex'&&thinkingSupported&&thinkingEnabled} title={executor==='codex'?'本地 Codex 的推理由模型管理':!thinkingSupported?'当前端点未配置 Thinking 支持，可在模型设置中配置':thinkingEnabled?'Thinking 已开启':'Thinking 已关闭'} class={'chat-thinking-switch'+(executor!=='codex'&&thinkingSupported&&thinkingEnabled?' enabled':'')} disabled={!editable||harness.busy||executor==='codex'||!thinkingSupported||thinkingSaving} onClick={()=>void toggleThinking(!thinkingEnabled)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/></svg></button>

          <button class="chat-config-button chat-preference-settings" title="聊天设置" aria-label="聊天设置" aria-expanded={settingsOpen} aria-controls="chat-connection-settings" onClick={()=>setSettingsOpen(!settingsOpen)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg></button>
        </div>
      </div>
    {settingsOpen?<section id="chat-connection-settings" class="chat-settings" aria-label="连接与偏好"><div class="chat-settings-heading"><strong>连接与偏好</strong><button aria-label="关闭快捷设置" onClick={()=>setSettingsOpen(false)}>×</button></div><p class="chat-settings-intro">按需连接，页面访问由你授权。</p>{!agentEnabled?<label><input type="checkbox" checked={repairAllowed} disabled={!editable} onChange={e=>{setRepairAllowed(e.currentTarget.checked);setEnvelope(null);}}/>允许基础检查失败时修复一次</label>:null}<button onClick={()=>void chrome.runtime.openOptionsPage()}>打开模型与连接设置</button><button disabled={!editable} onClick={()=>void refreshSite()}>刷新当前页面状态</button><label><input type="checkbox" checked={allowExternalDrafts} onChange={e=>setAllowExternalDrafts(e.currentTarget.checked)}/>允许本机集成读取当前工具并提交候选（运行仍需确认）</label><button disabled={!site||grantBusy||!editable} onClick={()=>void grantCurrentPage()}>授权本机集成访问此页</button>{allowExternalDrafts&&workspace&&<p>外部请求目标：工作区 <code>{workspace.id}</code> · 草稿版本 {workspace.draftRevision}</p>}<ExternalApprovals/>{pageGrantMessage&&<p role="status">{pageGrantMessage}</p>}</section>:null}
    </footer></>}

    <CodeArtifactDialog open={artifactOpen} onClose={()=>setArtifactOpen(false)} fullScreen={agentEnabled} footerContent={agentEnabled?<div class="v43-primary-tools"><button class={!receipt?'p2-primary':''} disabled={!editable||mismatch||!workspace?.draft||quality?.passed===false} onClick={()=>void versionAction('trial')}>授权试运行当前版本</button><button class={receipt?'p2-primary':''} disabled={!editable||!receipt||!name.trim()||harness.conversation?.effectCheck?.passed===false} onClick={()=>void versionAction('save')}>确认效果并保存当前版本</button><p>运行、局部检查与完整目标达成分别判断；保存需当前有效运行凭证。</p>{harness.conversation?.effectCheck?<section class="v43-report"><strong>{harness.conversation.effectCheck.passed?'当前确认计划检查通过':'检查发现问题或无法完整判断'}</strong><p>{harness.conversation.effectCheck.coverage}</p><ul>{harness.conversation.effectCheck.results.map(r=><li key={r.label}>候选 {r.label}：{({hidden:'已隐藏',dimmed:'已弱化',visible:'仍可见',missing:'节点已移除或替换',changed:'结构已变化'} as Record<string,string>)[r.status]??'需核对'}</li>)}</ul>{harness.conversation.effectCheck.preservation?.violations.map((v,i)=><p role="alert" key={i}>保留区域异常：{v.description}</p>)}<p>仅本次确认范围的检查，不代表整页语义目标达成。</p></section>:null}</div>:undefined} current={effective??null} saved={record?.current} previous={record?.previous} name={name} onName={setName} onEdit={keepCode} onReference={addCodeReference} busy={!editable} hasReference={!!reference}>{artifactTools}</CodeArtifactDialog>
    {exportArtifact?<ExportDialog artifact={exportArtifact} onClose={()=>setExportArtifact(null)} onDownloaded={()=>{setExportArtifact(null);setNotice('已发起保存版下载，请在目标管理器验证效果。');}}/>:null}
    <dialog class="p2-dialog" ref={dialogRef} onCancel={()=>setLeaving(null)}><h2>保留这次修改？</h2><p>需求或草稿尚未成为新的保存版本。</p><div class="p2-row"><button autoFocus onClick={()=>setLeaving(null)}>继续编辑</button><button onClick={()=>void decideLeave(true)}>放弃修改并离开</button><button class="p2-primary" onClick={()=>void decideLeave()}>保留草稿并离开</button></div></dialog>
  </div>;
}
