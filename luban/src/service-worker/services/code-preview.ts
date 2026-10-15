import type {CodePreviewMessage,CodePreviewSnapshot} from '../../shared/code-preview-types';
import type {ScriptStore} from '../script-store';
import {createReference,versionHash} from '../../shared/code-reference';
import {DataError,request} from '../repositories/database';
import {withWorkspaceLock} from './workspace-lock';
interface Session {snapshot:CodePreviewSnapshot;tabId:number;documentId:string;createdAt:number;}
interface StoredSession {id:string;sessionId:string;workspaceId:string;name:string;currentId:string;hash:string;savedId?:string;previousId?:string;tabId:number;documentId:string;createdAt:number;}
export class CodePreviewService {
 private sessions=new Map<string,Session>();
 constructor(private store:ScriptStore,private notify:(m:Extract<CodePreviewMessage,{type:'CODE_PREVIEW_UPDATED'}>)=>Promise<void>){ }
 async create(workspaceId:string,name:string,tabId:number,documentId:string){
  const ws=await this.store.workspaces.get(workspaceId);if(!ws)throw new DataError('WORKSPACE_MISSING','工作区已不存在。');
  const record=ws.scriptId?await this.store.record(ws.scriptId):undefined;const current=ws.draft??record?.current;if(!current)throw new DataError('DRAFT_MISSING','没有可预览的代码。');
  if(ws.status==='generating')throw new DataError('GENERATION_BUSY','请等待生成完成。');
  const snapshot:CodePreviewSnapshot={sessionId:crypto.randomUUID(),workspaceId,name:name.slice(0,100),current,saved:record?.current,previous:record?.previous,hasReference:!!ws.codeReference};
  const session={snapshot,tabId,documentId,createdAt:Date.now()};await this.persist(session);this.sessions.set(snapshot.sessionId,session);return snapshot;
 }
 private async persist(s:Session){
  const v=s.snapshot;const record:StoredSession={id:'v21:code-preview:'+v.sessionId,sessionId:v.sessionId,workspaceId:v.workspaceId,name:v.name,currentId:v.current.versionId,hash:await versionHash(v.current),savedId:v.saved?.versionId,previousId:v.previous?.versionId,tabId:s.tabId,documentId:s.documentId,createdAt:s.createdAt};
  await this.store.db.mutate(async tx=>{const meta=tx.objectStore('meta');const rows=(await request<StoredSession[]>(meta.getAll())).filter(r=>r.id.startsWith('v21:code-preview:')).sort((a,b)=>b.createdAt-a.createdAt);for(const row of rows.filter((r,i)=>i>=49||r.createdAt<Date.now()-30*60_000)){await request(meta.delete(row.id));this.sessions.delete(row.sessionId);}await request(meta.put(record));});
 }
 async location(id:string){await this.store.ready();return this.store.db.get<StoredSession>('meta','v21:code-preview:'+id);}
 async target(id:string):Promise<Session|undefined>{
  const cached=this.sessions.get(id);if(cached&&cached.createdAt>Date.now()-30*60_000)return cached;
  await this.store.ready();const row=await this.store.db.get<StoredSession>('meta','v21:code-preview:'+id);if(!row||row.createdAt<Date.now()-30*60_000)return;
  const ws=await this.store.workspaces.get(row.workspaceId),record=ws?.scriptId?await this.store.record(ws.scriptId):undefined,current=ws?.draft??record?.current;
  if(!current||current.versionId!==row.currentId||await versionHash(current)!==row.hash)throw new DataError('PREVIEW_STALE','当前脚本已变化，请关闭浮层后重新打开。');
  const s:Session={tabId:row.tabId,documentId:row.documentId,createdAt:row.createdAt,snapshot:{sessionId:id,workspaceId:row.workspaceId,name:row.name,current,saved:record&&record.current.versionId===row.savedId?record.current:undefined,previous:record?.previous?.versionId===row.previousId?record?.previous:undefined,hasReference:!!ws?.codeReference}};this.sessions.set(id,s);return s;
 }
 async forget(id:string){this.sessions.delete(id);await this.store.db.mutate(async tx=>{await request(tx.objectStore('meta').delete('v21:code-preview:'+id));});}
 async action(m:Extract<CodePreviewMessage,{type:'CODE_PREVIEW_ACTION'}>,sender:chrome.runtime.MessageSender){
  if(m.action==='close'||m.action==='more'){
   const row=await this.location(m.sessionId);if(!row||sender.id!==chrome.runtime.id||sender.frameId!==0||sender.tab?.id!==row.tabId||sender.documentId!==row.documentId)throw new DataError('PREVIEW_EXPIRED','代码浮层已失效。');
   await this.forget(m.sessionId);await this.notify({type:'CODE_PREVIEW_UPDATED',requestId:m.requestId,sessionId:m.sessionId,workspaceId:row.workspaceId,action:m.action,name:row.name});return;
  }
  const session=await this.target(m.sessionId);
  if(!session||sender.id!==chrome.runtime.id||sender.frameId!==0||sender.tab?.id!==session.tabId||sender.documentId!==session.documentId)throw new DataError('PREVIEW_EXPIRED','代码浮层已失效，请重新打开。');
  const s=session.snapshot;
  if(!['reference','edit','name'].includes(m.action))throw new DataError('INVALID_MESSAGE','代码操作无效。');
  return withWorkspaceLock(s.workspaceId,async()=>{
   const ws=await this.store.workspaces.get(s.workspaceId);const record=ws?.scriptId?await this.store.record(ws.scriptId):undefined;const baseline=ws?.draft??record?.current;
   if(!ws||!baseline||ws.status==='generating'||baseline.versionId!==s.current.versionId||await versionHash(baseline)!==await versionHash(s.current))throw new DataError('PREVIEW_STALE','当前脚本已变化，请关闭浮层后重新打开。');
   if(m.action==='reference'){
    const version=[s.current,s.saved,s.previous].find(v=>v?.versionId===m.versionId);if(!version||!Array.isArray(m.lines))throw new DataError('INVALID_REFERENCE','请选择有效代码行。');
    const reference=await createReference(ws.id,version,s.name,m.lines);await this.store.workspaces.saveDraft(ws.id,ws.draftRevision,{codeReference:reference});s.hasReference=true;
   }else if(m.action==='edit'){
    if(typeof m.code!=='string'||!m.code.trim())throw new DataError('INVALID_DRAFT','代码不能为空。');
    const draft={...baseline,code:m.code,versionId:crypto.randomUUID(),hash:'unverified-edit',explanation:'代码已手动修改，请重新检查并试运行。'};
    await this.store.workspaces.saveDraft(ws.id,ws.draftRevision,{draft});s.current=draft;
   }else{
    if(typeof m.name!=='string'||!m.name.trim()||m.name.length>100||/[\r\n\x00-\x1f]/.test(m.name))throw new DataError('INVALID_NAME','名称须为 1–100 字的单行文字。');s.name=m.name;
   }
   await this.persist(session);
   await this.notify({type:'CODE_PREVIEW_UPDATED',requestId:m.requestId,sessionId:s.sessionId,workspaceId:s.workspaceId,action:m.action,name:s.name});return structuredClone(s);
  });
 }
}
