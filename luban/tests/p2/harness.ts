import {getSettings} from '../../src/shared/settings-store';
import {CodePreviewService} from '../../src/service-worker/services/code-preview';
import type {CodePreviewSnapshot,CodePreviewMessage} from '../../src/shared/code-preview-types';
import {workflowCommand} from '../../src/service-worker/services/workspace-workflow';
import { exportCurrent } from '../../src/service-worker/services/userscript-export';
import { AutoRuntime } from '../../src/service-worker/services/auto-runtime';
import { autoSource } from '../../src/service-worker/services/auto-source';
import type { AutoAdapter } from '../../src/service-worker/services/auto-adapter';
import { VersionService } from '../../src/service-worker/services/version-service';
// 仅用于普通 HTTP 页面/单测：模拟 Chrome transport 与模型，不调用真实扩展/模型。
import { Database } from '../../src/service-worker/repositories/database';
import { ScriptStore } from '../../src/service-worker/script-store';
import { handleWorkspaceCommand, isWorkspaceCommand } from '../../src/service-worker/repositories/workspace-router';
import { WorkspaceGeneration } from '../../src/service-worker/services/workspace-generation';
import type { CapturedPage } from '../../src/shared/p2-types';
import type { UserScript } from '../../src/shared/types';
import type { LubanMessage } from '../../src/shared/messages';

export async function installHarness(databaseName?: string,pageCodePreview=false,generationDelayMs=200) {
  const db = new Database(databaseName ?? 'luban-p2-ui-test-'+crypto.randomUUID());
  const script=(id:string,host:string):UserScript=>({id,name:id==='a'?'价格一眼可见':'阅读更专注',description:'已有功能',explanation:'已有功能',code:'console.log("saved-'+id+'")',matches:[`*://${host}/*`],enabled:true,runAt:'document-end',source:'ai',gmGrants:[],createdAt:1,updatedAt:2});
  const store = new ScriptStore(db,async()=>({'luban:script:a':script('a','shop.example.com'),'luban:script:b':script('b','news.example.com')}));await store.ready();
  let site={tabId:1,documentId:crypto.randomUUID(),host:'shop.example.com',url:'https://shop.example.com/products',title:'演示商品页'};
  let failure=false,pickerRequestId='';let captures=0;
  const listeners=new Set<(m:LubanMessage,sender:chrome.runtime.MessageSender)=>void>();
  const activations=new Set<()=>void>();
  const navigations=new Set<(id:number,change:{url?:string})=>void>();let siteReads=0;let sessionValues:Record<string,unknown>={};
  const sender={id:'p2-fixture',url:'chrome-extension://p2-fixture/src/sidepanel/index.html'};
  const capture=async(selectors?:string[]):Promise<CapturedPage>=>{captures++;return {binding:{...site},context:{scope:selectors?.length?'element':'page',meta:{url:site.url,title:site.title,siteType:'shop'},
    target:selectors?.length?{selectorCandidates:selectors,tag:'article',text:'手作陶瓷杯',attributes:{class:'product'},contextPath:'main>article',siblings:['article']}:null,
    domSummary:{counts:{inputs:0,buttons:2,forms:0,links:2,images:6},inputs:[],buttons:['购买','收藏'],title:site.title,truncated:false,structure:[{tag:'article',selectors:['.product'],text:'手作陶瓷杯 · ¥89'}]}}};};
  let permissionAllowed=true,registrationFailure=false;const registered=new Map<string,{versionId:string;hash:string;source:string}>();let bridgeHosts:string[]=[];
  const adapter:AutoAdapter={permission:async()=>permissionAllowed,install:async(r,v=r.current)=>{if(registrationFailure)throw Error('模拟 Chrome 注册失败');registered.set(r.id,{versionId:v.versionId,hash:v.hash,source:autoSource(r,v)});},remove:async id=>{if(registrationFailure)throw Error('模拟 Chrome 清理失败');registered.delete(id);},syncBridges:async hosts=>{bridgeHosts=hosts;},prune:async ids=>{for(const id of registered.keys())if(!ids.includes(id))registered.delete(id);}};
  const auto=new AutoRuntime(store,adapter,async()=>({tabId:site.tabId,documentId:site.documentId,host:site.host}));await auto.ready();
  const versions=new VersionService(store,capture,async()=>({ok:!failure,timedOut:false,error:failure?'模拟试运行错误':undefined,changes:[]}),auto.coordinate);
  const sent:unknown[]=[];const modelOptions:Array<{thinking:boolean}>=[];
  const generation=new WorkspaceGeneration(store,capture,async()=>({thinkingEnabled:(await getSettings()).thinkingEnabled,id:'openai-compatible',model:'fixture-model',baseUrl:'https://fixture.invalid/v1',apiKey:'TEST_ONLY_NOT_A_REAL_KEY',billing:'onDemand'}),()=>{
    let cancelled=false;
    return{cancel:()=>{cancelled=true;},generate:async(_config,messages,_options,callbacks)=>{
      modelOptions.push(structuredClone(_options));sent.push(structuredClone(messages));callbacks.onDelta('正在生成完整脚本…');await new Promise(resolve=>setTimeout(resolve,generationDelayMs));
      if(cancelled)throw Error('fixture cancelled');if(failure)throw Error('模拟模型失败，原草稿保留');
      return{text:JSON.stringify({code:'// 本地模拟模型返回，不执行\nconsole.log("'+(JSON.stringify(messages).includes('字号')?'字号已调整':'页面工具')+'");',explanation:'示例：根据当前需求调整页面，保留原有行为。',selectors:['.product'],gmGrants:[],confidence:.9,warnings:[]})};
    }};
  });
  let pageSnapshot:CodePreviewSnapshot|null=null;
  const codePreview=new CodePreviewService(store,async m=>{await new Promise<void>(resolve=>{let answered=false;for(const fn of listeners)(fn as unknown as (m:LubanMessage,s:chrome.runtime.MessageSender,reply:()=>void)=>void)(m,{id:'p2-fixture'},()=>{answered=true;resolve();});if(!answered)setTimeout(resolve,100);});});
  async function request(m:LubanMessage):Promise<unknown>{
    if(m.type==='OPEN_CODE_PREVIEW'&&pageCodePreview){pageSnapshot=await codePreview.create(m.workspaceId,m.name,site.tabId,site.documentId);return{sessionId:pageSnapshot.sessionId};}
    if(m.type==='CLOSE_CODE_PREVIEW'&&pageCodePreview){await codePreview.forget(m.sessionId);pageSnapshot=null;return;}
    if(['GET_WORKFLOW','UPDATE_WORKFLOW','CHECK_DRAFT','EDIT_FAILURE'].includes(m.type))return workflowCommand(store,m as Extract<LubanMessage,{type:'GET_WORKFLOW'|'UPDATE_WORKFLOW'|'CHECK_DRAFT'|'EDIT_FAILURE'}>,capture);
    if(m.type==='V21_PREVIEW_TARGET'||m.type==='V21_CLEAR_PREVIEW')return{ok:true};
    if(isWorkspaceCommand(m.type))return handleWorkspaceCommand(m,sender,store);
    if(m.type==='EXPORT_CURRENT')return exportCurrent(store,m.scriptId);
    if(m.type==='RUN_SAVED_SCRIPT')return{ok:true,method:1,timingMs:0};
    if(m.type==='GET_AUTO_DIAGNOSTICS')return auto.diagnostics(m.scriptId);
    if(m.type==='LIST_RUNTIME_STATUS')return auto.statuses();
    if(m.type==='SET_AUTO_RUN')return auto.setEnabled(m.scriptId,m.expectedRevision,m.enabled);
    if(m.type==='GET_RUNTIME_STATUS')return auto.status(m.scriptId);
    if(m.type==='RETRY_AUTO_RUN')return auto.retry();
    if(m.type==='DELETE_SCRIPT'){const r=await store.record(m.scriptId);if(r)await auto.delete(r.id,r.recordRevision);return;}
    if(m.type==='TRIAL_DRAFT')return versions.trial(m.workspaceId,m.expectedDraftRevision);
    if(m.type==='COMMIT_DRAFT')return versions.commit(m.workspaceId,m.expectedDraftRevision,m.receiptId,m.name,m.opId,m.effectAcknowledged);
    if(m.type==='RESTORE_PREVIOUS')return versions.restore(m.workspaceId,m.expectedDraftRevision,m.expectedRevision,m.discardDraft,m.opId);
    if(m.type==='GET_CURRENT_SITE'){siteReads++;return site;}
    if(m.type==='GET_SCRIPT_RECORD')return store.record(m.scriptId);
    if(m.type==='LIST_SCRIPTS')return store.list();
    if(m.type==='PREPARE_GENERATION')return generation.prepare(m.workspaceId,m.expectedDraftRevision,m.selectors,m.repairAllowed);
    if(m.type==='CANCEL_WORKSPACE_GENERATION'){await generation.cancel(m.workspaceId);return;}
    if(m.type==='START_PICKER'){pickerRequestId=m.requestId;return;}
    if(m.type==='CANCEL_PICKER'){pickerRequestId='';return;}
    throw Error('unsupported fixture command: '+m.type);
  }
  const runtime={id:'p2-fixture',openOptionsPage:async()=>{document.querySelector('#fixture-settings')?.removeAttribute('hidden');},
    onMessage:{addListener:(fn:(m:LubanMessage,s:chrome.runtime.MessageSender)=>void)=>listeners.add(fn),removeListener:(fn:(m:LubanMessage,s:chrome.runtime.MessageSender)=>void)=>listeners.delete(fn)},
    sendMessage:async(m:LubanMessage)=>{try{return{ok:true,data:await request(m)};}catch(e){return{ok:false,error:{message:String(e instanceof Error?e.message:e),code:'FIXTURE',layer:'runtime',actions:[]}};}},
    connect:()=>{
      const incoming=new Set<(m:LubanMessage)=>void>(),closed=new Set<()=>void>();let disconnected=false;let workspaceId='';
      return{onMessage:{addListener:(fn:(m:LubanMessage)=>void)=>incoming.add(fn)},onDisconnect:{addListener:(fn:()=>void)=>closed.add(fn)},
        postMessage:(m:Extract<LubanMessage,{type:'GENERATE_WORKSPACE'}>)=>{workspaceId=m.workspaceId;const emit=(message:LubanMessage)=>{if(!disconnected)incoming.forEach(fn=>fn(message));};
          void generation.generate(m.workspaceId,m.envelopeId,m.requestId,content=>emit({type:'GENERATION_PROGRESS',requestId:m.requestId,content,done:false}),()=>disconnected)
            .then(result=>emit({type:'GENERATION_COMPLETE',requestId:m.requestId,result:result.result}))
            .catch(e=>emit({type:'GENERATION_FAILED',requestId:m.requestId,error:{message:String(e instanceof Error?e.message:e),code:'FIXTURE',layer:'runtime' as never,actions:[]}}));},
        disconnect:()=>{if(disconnected)return;disconnected=true;if(workspaceId)void generation.cancel(workspaceId);closed.forEach(fn=>fn());}};
    }};
  let synced:Record<string,unknown>={};
  Object.defineProperty(globalThis,'chrome',{configurable:true,value:{runtime,storage:{session:{get:async()=>sessionValues,set:async(data:Record<string,unknown>)=>{sessionValues={...sessionValues,...data};}},sync:{get:async()=>synced,set:async(data:Record<string,unknown>)=>{synced={...synced,...data};}},local:{get:async()=>({})}},permissions:{request:async()=>permissionAllowed},tabs:{onActivated:{addListener:(fn:()=>void)=>activations.add(fn),removeListener:(fn:()=>void)=>activations.delete(fn)},onUpdated:{addListener:(fn:(id:number,change:{url?:string})=>void)=>navigations.add(fn),removeListener:(fn:(id:number,change:{url?:string})=>void)=>navigations.delete(fn)}}}});
  return{db,store,sent,modelOptions,get siteReads(){return siteReads;},sessionValues:()=>({...sessionValues}),activateOtherTab:()=>activations.forEach(fn=>fn()),navigateTab:(id:number)=>navigations.forEach(fn=>fn(id,{url:'https://news.example.com/new'})),setGenerationDelay:(ms:number)=>{generationDelayMs=ms;},preview:()=>pageSnapshot,previewAction:async(extra:Omit<Extract<CodePreviewMessage,{type:'CODE_PREVIEW_ACTION'}>,'type'|'requestId'|'sessionId'>)=>{if(!pageSnapshot)throw Error('no preview');return codePreview.action({type:'CODE_PREVIEW_ACTION',requestId:crypto.randomUUID(),sessionId:pageSnapshot.sessionId,...extra},{id:'p2-fixture',tab:{id:site.tabId},frameId:0,documentId:site.documentId} as chrome.runtime.MessageSender);},registry:()=>({scripts:[...registered].map(([id,r])=>({id,versionId:r.versionId,hash:r.hash})),bridgeHosts}),setPermission:(v:boolean)=>{permissionAllowed=v;},setRegistrationFailure:(v:boolean)=>{registrationFailure=v;},get captures(){return captures;},setFailure:(value:boolean)=>{failure=value;},switchSite:()=>{site=site.host==='shop.example.com'?{...site,host:'news.example.com',url:'https://news.example.com/latest',documentId:crypto.randomUUID()}:{...site,host:'shop.example.com',url:'https://shop.example.com/products',documentId:crypto.randomUUID()};activations.forEach(fn=>fn());},
    pick:()=>{if(!pickerRequestId)return;listeners.forEach(fn=>fn({type:'ELEMENT_PICKED',requestId:pickerRequestId,context:{...pageContext(),target:{selectorCandidates:['.product'],tag:'article',text:'手作陶瓷杯',attributes:{class:'product'},contextPath:'main>article',siblings:[]}}},{id:'p2-fixture',frameId:0,tab:{id:1} as chrome.tabs.Tab}));},
    close:()=>db.close()};
  function pageContext(){return {scope:'element' as const,meta:{url:site.url,title:site.title,siteType:'shop'},domSummary:{counts:{inputs:0,buttons:2,forms:0,links:2,images:6},inputs:[],buttons:[],title:site.title,truncated:false}};}
}
