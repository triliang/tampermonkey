import {withWorkspaceLock,assertWorkspaceOwner,type WorkspaceOwner} from './workspace-lock';
import type {TrialOperation} from '../repositories/trial-operation';
import {getWorkflow} from './workspace-workflow';
import {inspectCode} from './code-quality';
import type { ScriptStore } from '../script-store';
import type { CapturedPage, PageBinding } from '../../shared/p2-types';
import type { TrialReceipt, TrialResult } from '../../shared/p3-types';
import type { ScriptRecord, ScriptVersion, WorkspaceRecord } from '../../shared/v2-types';
import { DataError, request } from '../repositories/database';
import { draftHash, validateTrial } from './trial-runner';

type Executor=(binding:PageBinding,v:ScriptVersion,namespace:string,hash:string,values:Record<string,unknown>)=>Promise<TrialResult>;
const samePage=(a:PageBinding,b:PageBinding)=>a.tabId===b.tabId&&a.documentId===b.documentId&&a.url===b.url&&a.host===b.host;
export class VersionService {
  private running=new Set<string>();
  constructor(private store:ScriptStore,private capture:(selectors?:string[])=>Promise<CapturedPage>,private execute:Executor,private coordinate?: (id:string,revision:number,candidate:ScriptVersion,opId:string,commit:()=>Promise<ScriptRecord>)=>Promise<ScriptRecord>,private verifyLive?:()=>Promise<void>,private verifyTarget?:(id:string,version:ScriptVersion)=>Promise<void>){}
  private async workspace(id:string,revision:number){
    const ws=await this.store.workspaces.get(id);
    if(!ws||ws.draftRevision!==revision)throw new DataError('REVISION_CONFLICT','草稿已变化，请重新打开。');
    if(ws.status==='generating')throw new DataError('GENERATION_BUSY','请等待生成结束。');
    return ws;
  }
  trial(id:string,revision:number,operationId:string=crypto.randomUUID(),source:'sidepanel'|'mcp'|'feishu'='sidepanel'):Promise<{result:TrialResult;receipt:TrialReceipt|null}>{if(!operationId||operationId.length>128)throw new DataError('INVALID_OPERATION','试运行操作编号无效。');return withWorkspaceLock(id,owner=>this.trialUnlocked(id,revision,owner,operationId),this.store.db,'trialRun',source);}
  private async trialUnlocked(id:string,revision:number,owner:WorkspaceOwner,operationId:string):Promise<{result:TrialResult;receipt:TrialReceipt|null}>{
    if(this.running.has(id))throw new DataError('TRIAL_BUSY','正在试运行，请等待。');
    this.running.add(id);
    const operationKey='trial:'+operationId;let executing=false;
    try{
      const ws=await this.workspace(id,revision);if(!ws.draft)throw new DataError('DRAFT_MISSING','没有待试运行的草稿。');
      await this.store.db.mutate(async tx=>{
      await assertWorkspaceOwner(tx,id,owner);
        if(await request(tx.objectStore('approvals').get(operationKey)))throw new DataError('APPROVAL_ALREADY_CONSUMED','此试运行确认已经使用，未再次执行。');
        const unresolved=await request<TrialOperation[]>(tx.objectStore('approvals').getAll());if(unresolved.some(op=>op.workspaceId===id&&['executing','unknown'].includes(op.state)))throw new DataError('RECOVERY_REQUIRED','上次试运行结果未知，请先在连接设置中核对并处理。');
        for(const receipt of await request<TrialReceipt[]>(tx.objectStore('receipts').getAll()))if(receipt.workspaceId===id)await request(tx.objectStore('receipts').delete(receipt.id));
      });
    validateTrial(ws.draft);const hash=await draftHash(ws.draft);
      const workflow=await getWorkflow(this.store,id);
      const page=await this.capture();if(workflow.targetFingerprint){const targetPage=await this.capture(workflow.selectors);if(workflow.binding&&!samePage(workflow.binding,targetPage.binding))throw new DataError('TARGET_STALE','页面已变化，请重新点选。');if(targetPage.context.target?.targetContext?.candidates[0]?.fingerprint!==workflow.targetFingerprint)throw new DataError('TARGET_STALE','目标已变化，请重新点选。');}
      if(!ws.host||page.binding.host!==ws.host)throw new DataError('WRONG_PAGE','请切回工具适用网站。');
      const namespace=ws.scriptId??'workspace:'+id;
      const values=await this.store.workspaces.readGm(namespace);
      await this.verifyTarget?.(id,ws.draft);
      await this.store.db.mutate(async tx=>{await assertWorkspaceOwner(tx,id,owner);const current=await request<WorkspaceRecord>(tx.objectStore('workspaces').get(id));if(current.draftRevision!==revision)throw new DataError('REVISION_CONFLICT','草稿已变化。');const operation:TrialOperation={id:operationKey,workspaceId:id,ownerToken:owner.token,workerId:owner.workerId,draftRevision:revision,codeHash:hash,binding:page.binding,state:'executing',createdAt:Date.now(),updatedAt:Date.now()};await request(tx.objectStore('approvals').add(operation));});
      executing=true;
      const result=await this.execute(page.binding,ws.draft,ws.scriptId??id,hash,values);
      await this.verifyLive?.();
      if(!result||typeof result.ok!=='boolean'||!Array.isArray(result.changes))throw new DataError('INVALID_RESULT','试运行结果无效。');
      // 已产生的 GM 副作用即使正文报错也保留；失败绝不签发保存凭证。
      await this.store.db.mutate(async tx=>{
      await assertWorkspaceOwner(tx,id,owner);
        const row=await request<{id:string;values:Record<string,unknown>}|undefined>(tx.objectStore('gm').get(namespace));
        const next=Object.assign(Object.create(null),row?.values);
        for(const change of result.changes){if(typeof change.key!=='string'||!['set','delete'].includes(change.op))throw new DataError('INVALID_GM','试运行 GM 变化无效。');if(change.op==='delete')delete next[change.key];else next[change.key]=change.value;}
        await request(tx.objectStore('gm').put({id:namespace,values:next}));
      });
      const fresh=await this.workspace(id,revision);
      if(!fresh.draft||await draftHash(fresh.draft)!==hash||!samePage(page.binding,(await this.capture()).binding))throw new DataError('STALE_TRIAL','页面或代码已变化，试运行结果不能用于保存。');
      if(!result.ok||result.timedOut){
        await this.store.workspaces.saveDraft(id,revision,{},[{role:'assistant',text:'试运行错误：'+(result.error??'执行未完成'),createdAt:Date.now()}],undefined,owner);
        await this.store.db.mutate(async tx=>{const operation=await request<TrialOperation>(tx.objectStore('approvals').get(operationKey));operation.state=result.timedOut?'unknown':'failed';operation.updatedAt=Date.now();await request(tx.objectStore('approvals').put(operation));});executing=false;
        return {result,receipt:null};
      }
      let postTargetFingerprint:string|null=null,targetRemovedAfterTrial=false;
      if(workflow.targetFingerprint){try{postTargetFingerprint=(await this.capture(workflow.selectors)).context.target?.targetContext?.candidates[0]?.fingerprint??null;}catch(e){if(e instanceof DataError&&e.code==='CAPTURE_FAILED')targetRemovedAfterTrial=true;else throw e;}}
      const receipt:TrialReceipt={id:crypto.randomUUID(),workspaceId:id,draftHash:hash,draftRevision:revision,binding:page.binding,expiresAt:Date.now()+30*60_000,workflowRevision:workflow.revision,targetFingerprint:workflow.targetFingerprint,postTargetFingerprint,targetRemovedAfterTrial,checkerVersion:inspectCode(ws.draft.code,ws.draft.grants).checkerVersion};
      await this.verifyLive?.();
      await this.store.db.mutate(async tx=>{
      await assertWorkspaceOwner(tx,id,owner);
        const current=await request<WorkspaceRecord>(tx.objectStore('workspaces').get(id));
        if(current.draftRevision!==revision)throw new DataError('REVISION_CONFLICT','草稿已变化。');
        for(const old of await request<TrialReceipt[]>(tx.objectStore('receipts').getAll()))if(old.workspaceId===id)await request(tx.objectStore('receipts').delete(old.id));
        await request(tx.objectStore('receipts').put(receipt));
        const operation=await request<TrialOperation>(tx.objectStore('approvals').get(operationKey));operation.state='completed';operation.receiptId=receipt.id;operation.updatedAt=Date.now();await request(tx.objectStore('approvals').put(operation));
      });executing=false;return {result,receipt};
    }catch(e){if(executing){const definitelyNotStarted=e instanceof DataError&&e.code==='USER_SCRIPTS_REQUIRED';await this.store.db.mutate(async tx=>{const operation=await request<TrialOperation|undefined>(tx.objectStore('approvals').get(operationKey));if(operation){operation.state=definitelyNotStarted?'failed':'unknown';operation.updatedAt=Date.now();await request(tx.objectStore('approvals').put(operation));}}).catch(()=>undefined);if(!definitelyNotStarted&&!(e instanceof DataError))throw new DataError('TRIAL_OUTCOME_UNKNOWN','执行结果未知，请核对页面后处理：'+(e instanceof Error?e.message:'未收到回执'));}throw e;
    }finally{this.running.delete(id);}
  }
  private validName(name:string){if(typeof name!=='string'||!name.trim()||name.trim().length>100||/[\r\n\x00-\x1f]/.test(name))throw new DataError('INVALID_NAME','请输入 1–100 字的单行工具名称。');return name.trim();}
  private async replay(opId:string,fingerprint:string):Promise<ScriptRecord|undefined>{
    if(typeof opId!=='string'||!opId||opId.length>100)throw new DataError('INVALID_OPERATION','操作编号无效。');
    await this.store.ready();const old=await this.store.db.get<{id:string;fingerprint:string;result:ScriptRecord}>('meta','version:'+opId);
    if(old&&old.fingerprint!==fingerprint)throw new DataError('OP_CONFLICT','操作编号已用于其他请求。');return old?.result;
  }
  commit(id:string,revision:number,receiptId:string,name:string,opId:string,effectAcknowledged=false):Promise<ScriptRecord>{return withWorkspaceLock(id,owner=>this.commitUnlocked(id,revision,receiptId,name,opId,effectAcknowledged,owner),this.store.db,'saveVersion');}
  private async commitUnlocked(id:string,revision:number,receiptId:string,name:string,opId:string,effectAcknowledged=false,owner?:WorkspaceOwner):Promise<ScriptRecord>{
    name=this.validName(name);const fingerprint=JSON.stringify(['commit',id,revision,receiptId,name]);
    const replay=await this.replay(opId,fingerprint);if(replay)return replay;
    const ws=await this.workspace(id,revision);if(!ws.draft)throw new DataError('DRAFT_MISSING','没有待保存草稿。');
      const workflow=await getWorkflow(this.store,id);
    if((workflow.outcome||workflow.revision>0)&&!effectAcknowledged)throw new DataError('EFFECT_CONFIRM_REQUIRED','请确认效果符合预期后再保存。');
    if(workflow.targetFingerprint){
      const observed=await this.store.db.get<TrialReceipt>('receipts',receiptId);
      if(observed?.targetRemovedAfterTrial){/* 正文可能移除了已确认目标；仍需页面/代码/工作流与人工确认全部有效。 */}
      else {const selected=await this.capture(workflow.selectors);if(selected.context.target?.targetContext?.candidates[0]?.fingerprint!==(observed?.postTargetFingerprint??workflow.targetFingerprint))throw new DataError('TARGET_STALE','试运行后目标再次变化，请重新点选并试运行。');}
    }
    validateTrial(ws.draft);const hash=await draftHash(ws.draft),binding=(await this.capture()).binding;
    const version={...ws.draft,hash};
    const work=()=>this.store.db.mutate(async tx=>{
      await assertWorkspaceOwner(tx,id,owner);
      const prior=await request<{fingerprint:string;result:ScriptRecord}|undefined>(tx.objectStore('meta').get('version:'+opId));
      if(prior){if(prior.fingerprint!==fingerprint)throw new DataError('OP_CONFLICT','操作编号冲突。');return prior.result;}
      const currentWs=await request<WorkspaceRecord>(tx.objectStore('workspaces').get(id));
      if(!currentWs||currentWs.draftRevision!==revision||JSON.stringify(currentWs.draft)!==JSON.stringify(ws.draft))throw new DataError('REVISION_CONFLICT','草稿已变化。');
      const receipt=await request<TrialReceipt|undefined>(tx.objectStore('receipts').get(receiptId));
      if(!receipt||receipt.workspaceId!==id||(receipt.workflowRevision??0)!==workflow.revision||(receipt.targetFingerprint??null)!==workflow.targetFingerprint||receipt.draftHash!==hash||receipt.draftRevision!==revision||receipt.expiresAt<=Date.now()||!samePage(receipt.binding,binding))throw new DataError('TRIAL_REQUIRED','请在当前页面重新试运行后保存。');
      let record:ScriptRecord;
      if(ws.scriptId){
        record=await this.writable(tx,ws.scriptId,ws.baseRevision!,opId);
        if(record.current.hash!==hash){record.previous=record.current;record.current=version;}
        record.name=name;record.recordRevision++;record.updatedAt=Date.now();
      }else{
        if(!ws.host)throw new DataError('INVALID_HOST','缺少适用网站。');
        if(await request(tx.objectStore('scripts').get(id)))throw new DataError('ID_CONFLICT','工具编号冲突，请重新创建。');
        record={id,schemaVersion:2,name,host:ws.host,matches:[`*://${ws.host}/*`],needsRuleReview:false,recordRevision:1,current:version,previous:null,autoRun:{desired:false,generation:0},tombstone:false,source:'ai',enabled:true,createdAt:Date.now(),updatedAt:Date.now()};
        const gm=await request<{values:Record<string,unknown>}|undefined>(tx.objectStore('gm').get('workspace:'+id));
        await request(tx.objectStore('gm').put({id:record.id,values:gm?.values??{}}));await request(tx.objectStore('gm').delete('workspace:'+id));
      }
      await request(tx.objectStore('scripts').put(record));
      Object.assign(currentWs,{scriptId:record.id,baseRevision:record.recordRevision,draft:null,input:'',codeReference:null,draftRevision:revision+1});
      await request(tx.objectStore('workspaces').put(currentWs));await request(tx.objectStore('receipts').delete(receiptId));
      await request(tx.objectStore('meta').put({id:'version:'+opId,fingerprint,result:record}));await request(tx.objectStore('operations').delete(opId));return record;
    });
    return ws.scriptId&&this.coordinate?this.coordinate(ws.scriptId,ws.baseRevision!,version,opId,work):work();
  }
  private async writable(tx:IDBTransaction,id:string,revision:number,opId?:string){
    const r=await request<ScriptRecord|undefined>(tx.objectStore('scripts').get(id));
    if(!r||r.tombstone||r.recordRevision!==revision)throw new DataError('REVISION_CONFLICT','保存版本已变化，当前草稿保留。');
    const ops=(await request<Array<{id:string;scriptId:string;expectedRevision:number}>>(tx.objectStore('operations').getAll())).filter(o=>o.scriptId===id);
    const owns=!!this.coordinate&&ops.length===1&&ops[0].id===opId&&ops[0].expectedRevision===revision;
    if(r.autoRun.desired&&!owns)throw new DataError('AUTO_RUN_COORDINATION_REQUIRED','自动运行版本需经注册协调后更新。');
    if(ops.length&&!owns)throw new DataError('RECOVERY_REQUIRED','存在待恢复操作。');return r;
  }
  restore(id:string,draftRevision:number,revision:number,discard:boolean,opId:string):Promise<ScriptRecord>{return withWorkspaceLock(id,owner=>this.restoreUnlocked(id,draftRevision,revision,discard,opId,owner),this.store.db,'restoreVersion');}
  private async restoreUnlocked(id:string,draftRevision:number,revision:number,discard:boolean,opId:string,owner:WorkspaceOwner):Promise<ScriptRecord>{
    const fingerprint=JSON.stringify(['restore',id,draftRevision,revision,discard]);const replay=await this.replay(opId,fingerprint);if(replay)return replay;
    const work=()=>this.store.db.mutate(async tx=>{
      await assertWorkspaceOwner(tx,id,owner);
      const prior=await request<{fingerprint:string;result:ScriptRecord}|undefined>(tx.objectStore('meta').get('version:'+opId));if(prior){if(prior.fingerprint!==fingerprint)throw new DataError('OP_CONFLICT','操作编号冲突。');return prior.result;}
      const ws=await request<WorkspaceRecord|undefined>(tx.objectStore('workspaces').get(id));
      if(!ws?.scriptId||ws.draftRevision!==draftRevision||ws.status==='generating')throw new DataError('REVISION_CONFLICT','工作区已变化。');
      if((ws.draft||ws.input)&&discard!==true)throw new DataError('DISCARD_REQUIRED','请明确确认放弃草稿后再恢复。');
      const r=await this.writable(tx,ws.scriptId,revision,opId);if(!r.previous)throw new DataError('PREVIOUS_MISSING','没有上一版。');
      [r.current,r.previous]=[r.previous,r.current];r.recordRevision++;r.updatedAt=Date.now();
      Object.assign(ws,{draft:null,input:'',codeReference:null,baseRevision:r.recordRevision,draftRevision:ws.draftRevision+1});
      await request(tx.objectStore('scripts').put(r));await request(tx.objectStore('workspaces').put(ws));
      for(const receipt of await request<TrialReceipt[]>(tx.objectStore('receipts').getAll()))if(receipt.workspaceId===id)await request(tx.objectStore('receipts').delete(receipt.id));
      await request(tx.objectStore('meta').put({id:'version:'+opId,fingerprint,result:r}));await request(tx.objectStore('operations').delete(opId));return r;
    });
    const workspace=await this.store.workspaces.get(id);
    const record=workspace?.scriptId?await this.store.record(workspace.scriptId):undefined;
    return record?.previous&&this.coordinate?this.coordinate(record.id,revision,record.previous,opId,work):work();
  }
}
