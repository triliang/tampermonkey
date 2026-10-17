import type { AutoRequest, RuntimeStatus } from '../../shared/p4-types';
import type { ScriptRecord, ScriptVersion, WorkspaceRecord, OperationRecord } from '../../shared/v2-types';
import type { ScriptStore } from '../script-store';
import { DataError, request, byteSize } from '../repositories/database';
import type { AutoAdapter } from './auto-adapter';
import { hostPattern } from '../../shared/host-policy';
import { validateTrial } from './trial-runner';
import {assertScriptExecutionIdle,assertWorkspaceOwner} from './workspace-lock';
interface Source{tabId:number;documentId:string;host:string;}
interface Lease{ id:string;kind:'lease';scriptId:string;versionId:string;hash:string;generation:number;source:Source;lastSeq:number;expiresAt:number; }
const failure=(code:string,message:string):never=>{throw new DataError(code,message);};
export class AutoRuntime{
  private tail:Promise<unknown>=Promise.resolve();
  private startup:Promise<void>|null=null;
  private rates=new Map<string,{at:number;count:number}>();
  constructor(private store:ScriptStore,private adapter:AutoAdapter,private source:(sender:chrome.runtime.MessageSender)=>Promise<Source>){}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const task=this.tail.then(fn);this.tail=task.catch(()=>undefined);return task;}
  ready(){return this.startup??=this.serial(()=>this.reconcileNow());}
  async retry(){await this.ready();return this.serial(()=>this.reconcileNow());}
  async status(id:string):Promise<RuntimeStatus|undefined>{await this.ready();return this.store.db.get('runtimeStatus',id);}
  async statuses():Promise<RuntimeStatus[]>{await this.ready();return (await this.store.db.all<RuntimeStatus>('runtimeStatus')).filter(r=>typeof r.state==='string');}
  async diagnostics(id:string){
    await this.ready();const record=await this.store.record(id);if(!record)failure('SCRIPT_MISSING','工具不存在。');
    return{checkedAt:new Date().toISOString(),scriptId:id,host:record!.host,desired:record!.autoRun.desired,generation:record!.autoRun.generation,currentVersionId:record!.current.versionId,currentHash:record!.current.hash,status:await this.status(id),pending:(await this.store.db.all<OperationRecord>('operations')).filter(o=>o.scriptId===id).map(o=>({id:o.id,type:o.type,phase:o.phase})),chrome:this.adapter.inspect?await this.adapter.inspect(record!):{simulated:true}};
  }
  private async setStatus(id:string,state:RuntimeStatus['state'],message:string,versionId?:string){await this.store.db.mutate(async tx=>{await request(tx.objectStore('runtimeStatus').put({id,state,message,registeredVersionId:versionId,updatedAt:Date.now()}));});}
  private async pending(tx:IDBTransaction,id:string){return (await request<OperationRecord[]>(tx.objectStore('operations').getAll())).filter(o=>o.scriptId===id);}
  private async check(tx:IDBTransaction,id:string,revision:number){
    await assertScriptExecutionIdle(tx,id);
    const r=await request<ScriptRecord|undefined>(tx.objectStore('scripts').get(id));
    if(!r||r.tombstone||r.recordRevision!==revision)failure('REVISION_CONFLICT','工具已变化，请重新打开。');
    if((await this.pending(tx,id)).length)failure('RECOVERY_REQUIRED','存在未完成的注册操作，请重试恢复。');return r!;
  }
  private async bases(tx:IDBTransaction,id:string,before:number,after:number){for(const w of await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll()))if(w.scriptId===id&&w.baseRevision===before){w.baseRevision=after;await request(tx.objectStore('workspaces').put(w));}}
  async setEnabled(id:string,revision:number,enabled:boolean):Promise<ScriptRecord>{
    if(typeof enabled!=='boolean')failure('INVALID_MESSAGE','开关参数无效。');await this.ready();
    return this.serial(async()=>{
      const r=await this.store.record(id);if(!r||r.tombstone||r.recordRevision!==revision)failure('REVISION_CONFLICT','工具已变化。');
      if(enabled){
        if(!r!.host||r!.needsRuleReview||r!.current.runAt!=='document_end')failure('RULE_REVIEW_REQUIRED','请在准确网站重新生成、试运行并保存 document_end 工具。');
        hostPattern(r!.host!);validateTrial(r!.current);
        if(!await this.adapter.permission(r!.host!))failure('SITE_PERMISSION_REQUIRED','未获当前网站权限；工具已保存，自动运行未开启。');
      }
      const opId=crypto.randomUUID();
      const next=await this.store.db.mutate(async tx=>{
        const record=await this.check(tx,id,revision);
        if(enabled){await request(tx.objectStore('operations').put({id:opId,scriptId:id,type:'enable',expectedRevision:revision,phase:'prepared',createdAt:Date.now()}));return {...record,autoRun:{desired:true,generation:record.autoRun.generation+1}};}
        record.autoRun={desired:false,generation:record.autoRun.generation+1};record.recordRevision++;record.updatedAt=Date.now();
        await request(tx.objectStore('scripts').put(record));await this.bases(tx,id,revision,record.recordRevision);
        await request(tx.objectStore('operations').put({id:opId,scriptId:id,type:'disable',expectedRevision:record.recordRevision,phase:'prepared',createdAt:Date.now()}));return record;
      });
      try{
        if(enabled){await this.syncBridges([next]);await this.adapter.install(next);await this.store.db.mutate(async tx=>{
          const current=await request<ScriptRecord>(tx.objectStore('scripts').get(id));if(current.recordRevision!==revision)failure('REVISION_CONFLICT','开启期间版本变化。');
          next.recordRevision=revision+1;next.updatedAt=Date.now();await request(tx.objectStore('scripts').put(next));await this.bases(tx,id,revision,next.recordRevision);await request(tx.objectStore('operations').delete(opId));
          await request(tx.objectStore('runtimeStatus').put({id,state:'ready',message:'自动运行已开启',registeredVersionId:next.current.versionId,updatedAt:Date.now()}));
        });}else{await this.adapter.remove(id);await this.clearOps(id);await this.setStatus(id,'disabled','自动运行已关闭；已打开页面的效果需刷新。');await this.syncBridges();}
        return next;
      }catch(e){
        if(enabled){await this.rollback(id,e);}else await this.setStatus(id,'cleanup_required','已关闭启动许可，注册清理失败，请重试。');throw e;
      }
    });
  }
  private async syncBridges(extra:ScriptRecord[]=[]){const all=await this.store.db.all<ScriptRecord>('scripts');const byId=new Map([...all,...extra].map(r=>[r.id,r]));const hosts=[...new Set([...byId.values()].filter(r=>r.autoRun.desired&&!r.tombstone&&r.host).map(r=>r.host!))];const allowed:string[]=[];for(const host of hosts)if(await this.adapter.permission(host))allowed.push(host);await this.adapter.syncBridges(allowed);}
  private async clearOps(id:string){await this.store.db.mutate(async tx=>{for(const op of await this.pending(tx,id))await request(tx.objectStore('operations').delete(op.id));});}
  private async rollback(id:string,error:unknown){
    const r=await this.store.record(id);if(!r)return;
    try{
      if(r.autoRun.desired&&!r.tombstone&&r.host&&await this.adapter.permission(r.host)){await this.adapter.install(r);await this.clearOps(id);await this.setStatus(id,'ready','更新未成功，已恢复保存版：'+String(error),r.current.versionId);}
      else{await this.adapter.remove(id);await this.clearOps(id);await this.setStatus(id,r.autoRun.desired?'unavailable':'disabled',String(error));}
    }catch(e){await this.setStatus(id,'unavailable','回补注册失败，已暂停运行许可，请重试：'+String(e));}
  }
  coordinate=(id:string,revision:number,candidate:ScriptVersion,opId:string,commit:()=>Promise<ScriptRecord>):Promise<ScriptRecord>=>{
    return (async()=>{await this.ready();return this.serial(async()=>{
      if(await this.store.db.get('meta','version:'+opId))return commit();
      const r=await this.store.record(id);if(!r||!r.autoRun.desired)return commit();
      if(candidate.runAt!=='document_end')failure('UNSUPPORTED_RUN_AT','自动运行仅支持 document_end。');validateTrial(candidate);
      await this.store.db.mutate(async tx=>{await this.check(tx,id,revision);await request(tx.objectStore('operations').put({id:opId,scriptId:id,type:'update',expectedRevision:revision,candidate,phase:'prepared',createdAt:Date.now()}));});
      try{
        if(!r.host||!await this.adapter.permission(r.host))failure('SITE_PERMISSION_REQUIRED','网站授权已撤销，草稿保留。');
        await this.adapter.install(r,candidate);const result=await commit();await this.setStatus(id,'ready','已更新自动运行版本',result.current.versionId);return result;
      }catch(e){await this.rollback(id,e);throw e;}
    });})();
  };
  async delete(id:string,revision:number){await this.ready();return this.serial(async()=>{
    await this.store.db.mutate(async tx=>{for(const workspace of await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll()))if(workspace.scriptId===id)await assertWorkspaceOwner(tx,workspace.id);const r=await this.check(tx,id,revision);r.tombstone=true;r.autoRun={desired:false,generation:r.autoRun.generation+1};r.recordRevision++;await request(tx.objectStore('scripts').put(r));await request(tx.objectStore('operations').put({id:crypto.randomUUID(),scriptId:id,type:'delete',expectedRevision:r.recordRevision,phase:'prepared',createdAt:Date.now()}));});
    try{await this.adapter.remove(id);await this.purge(id);await this.syncBridges();}catch(e){await this.setStatus(id,'cleanup_required','删除已禁用运行，清理失败，请重试：'+String(e));throw e;}
  });}
  private async purge(id:string){await this.store.db.mutate(async tx=>{
    const ws=await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll()),ids=new Set(ws.filter(w=>w.scriptId===id).map(w=>w.id));
    for(const wid of ids){await request(tx.objectStore('workspaces').delete(wid));await request(tx.objectStore('conversations').delete(wid));await request(tx.objectStore('gm').delete('workspace:'+wid));}
    for(const receipt of await request<Array<{id:string;workspaceId:string}>>(tx.objectStore('receipts').getAll()))if(ids.has(receipt.workspaceId))await request(tx.objectStore('receipts').delete(receipt.id));
    for(const lease of await request<Array<{id:string;scriptId?:string}>>(tx.objectStore('runtimeStatus').getAll()))if(lease.scriptId===id||lease.id===id)await request(tx.objectStore('runtimeStatus').delete(lease.id));
    for(const meta of await request<Array<{id:string;result?:ScriptRecord;workspaceId?:string}>>(tx.objectStore('meta').getAll()))if(meta.result?.id===id||(meta.workspaceId&&ids.has(meta.workspaceId)))await request(tx.objectStore('meta').delete(meta.id));
    for(const op of await this.pending(tx,id))await request(tx.objectStore('operations').delete(op.id));
    await request(tx.objectStore('gm').delete(id));await request(tx.objectStore('scripts').delete(id));
  });}
  private async reconcileNow(){
    await this.store.ready();const all=await this.store.db.all<ScriptRecord>('scripts');
    // 在接管外部注册之前暂停许可；失败保留 unavailable，不默认放行。
    for(const r of all)await this.setStatus(r.id,r.autoRun.desired?'unavailable':'disabled','正在核对保存版本与注册');
    for(const r of all){try{
      if(r.tombstone){await this.adapter.remove(r.id);await this.purge(r.id);continue;}
      if(!r.autoRun.desired){await this.adapter.remove(r.id);await this.clearOps(r.id);await this.setStatus(r.id,'disabled','自动运行关闭');continue;}
      if(!r.host||r.needsRuleReview||r.current.runAt!=='document_end')failure('RULE_REVIEW_REQUIRED','适用规则需重新确认。');validateTrial(r.current);
      if(!await this.adapter.permission(r.host!))failure('SITE_PERMISSION_REQUIRED','网站授权已撤销，请重新授权或关闭自动运行。');
      await this.syncBridges();await this.adapter.install(r);await this.clearOps(r.id);await this.setStatus(r.id,'ready','自动运行可用',r.current.versionId);
    }catch(e){await this.setStatus(r.id,r.tombstone?'cleanup_required':'unavailable',String(e));}}
    try{await this.adapter.prune(all.filter(r=>r.autoRun.desired&&!r.tombstone).map(r=>r.id));await this.syncBridges();}catch(e){for(const r of all.filter(r=>r.autoRun.desired&&!r.tombstone))await this.setStatus(r.id,'unavailable','注册核对失败，请重试：'+String(e));}
  }
  async bridge(raw:AutoRequest,sender:chrome.runtime.MessageSender):Promise<unknown>{
    await this.ready();
    if(!raw||!['start','delta','result'].includes(raw.kind)||typeof raw.requestId!=='string'||raw.requestId.length>100||typeof raw.scriptId!=='string'||typeof raw.versionId!=='string'||typeof raw.hash!=='string'||!Number.isInteger(raw.generation)||byteSize(raw)>32768)failure('INVALID_BRIDGE','运行消息无效或过大。');
    const source=await this.source(sender),rateKey=source.tabId+':'+source.documentId;
    const rate=this.rates.get(rateKey)??{at:Date.now(),count:0};if(Date.now()-rate.at>1000){rate.at=Date.now();rate.count=0;}if(++rate.count>120)failure('RATE_LIMIT','运行消息过多。');this.rates.set(rateKey,rate);if(this.rates.size>1000)for(const[k,v]of this.rates)if(Date.now()-v.at>1000)this.rates.delete(k);
    const record=await this.store.record(raw.scriptId);if(!record?.host||!await this.adapter.permission(record.host))failure('SITE_PERMISSION_REQUIRED','网站权限不可用。');
    return this.store.db.mutate(async tx=>{
      await assertScriptExecutionIdle(tx,raw.scriptId);
      const r=await request<ScriptRecord|undefined>(tx.objectStore('scripts').get(raw.scriptId));
      const status=await request<RuntimeStatus|undefined>(tx.objectStore('runtimeStatus').get(raw.scriptId));
      if(!r||r.tombstone||!r.autoRun.desired||r.host!==source.host||r.current.versionId!==raw.versionId||r.current.hash!==raw.hash||r.autoRun.generation!==raw.generation||(status?.state!=='ready'||status.registeredVersionId!==raw.versionId)||(await this.pending(tx,r.id)).length)failure('START_DENIED','此版本未获准运行，或已有未完成的操作。');
      const workspaces=(await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll())).filter(ws=>ws.scriptId===raw.scriptId);
      if(raw.kind!=='result'){
        for(const workspace of workspaces){const lock=await request<{token:string;expiresAt:number}|undefined>(tx.objectStore('workspaceLeases').get(workspace.id));if(lock?.token&&lock.expiresAt>Date.now())failure('WORKSPACE_BUSY','当前工作区正在处理，自动运行未获准写入。');}
        const operations=await request<Array<{workspaceId:string;state:string}>>(tx.objectStore('approvals').getAll());
        if(operations.some(operation=>workspaces.some(ws=>ws.id===operation.workspaceId)&&['executing','unknown'].includes(operation.state)))failure('RECOVERY_REQUIRED','当前工具存在未核对的网页操作。');
      }
      if(raw.kind==='start'){
        const leases=await request<Lease[]>(tx.objectStore('runtimeStatus').getAll());
        for(const l of leases)if(l.kind==='lease'&&l.expiresAt<Date.now())await request(tx.objectStore('runtimeStatus').delete(l.id));
        let lease=leases.find(l=>l.kind==='lease'&&l.scriptId===r!.id&&l.versionId===raw.versionId&&l.generation===raw.generation&&l.source.tabId===source.tabId&&l.source.documentId===source.documentId&&l.expiresAt>Date.now());
        if(!lease){if(leases.filter(l=>l.kind==='lease'&&l.expiresAt>Date.now()).length>=2000)failure('LEASE_LIMIT','运行文档过多，请关闭旧页面后重试。');lease={id:'lease:'+crypto.randomUUID(),kind:'lease',scriptId:r!.id,versionId:raw.versionId,hash:raw.hash,generation:raw.generation,source,lastSeq:0,expiresAt:Date.now()+24*60*60_000};await request(tx.objectStore('runtimeStatus').put(lease));}
        const gm=await request<{values:Record<string,unknown>}|undefined>(tx.objectStore('gm').get(r!.id));return{leaseId:lease.id,gm:r!.current.grants.includes('GM_getValue')?(gm?.values??{}):{}};
      }
      const lease=typeof raw.leaseId==='string'?await request<Lease|undefined>(tx.objectStore('runtimeStatus').get(raw.leaseId)):undefined;
      if(!lease||lease.kind!=='lease'||lease.scriptId!==r!.id||lease.versionId!==raw.versionId||lease.hash!==raw.hash||lease.generation!==raw.generation||lease.expiresAt<=Date.now()||lease.source.tabId!==source.tabId||lease.source.documentId!==source.documentId)failure('LEASE_DENIED','运行许可已失效。');
      if(raw.kind==='result'){
        if(raw.error!==undefined&&typeof raw.error!=='string')failure('INVALID_RESULT','错误回执无效。');
        if(raw.error)await request(tx.objectStore('runtimeStatus').put({...status,message:'最近运行错误：'+raw.error.slice(0,1000),updatedAt:Date.now()}));return{};
      }
      if(!Number.isInteger(raw.seq)||raw.seq!<1||typeof raw.key!=='string'||raw.key.length>500||!['set','delete'].includes(raw.op!))failure('INVALID_GM','GM 写入结构无效。');
      if(!r!.current.grants.includes(raw.op==='set'?'GM_setValue':'GM_deleteValue'))failure('GRANT_DENIED','未声明 GM 写入权限。');
      if(raw.seq!<=lease!.lastSeq)return{duplicate:true};if(raw.seq!==lease!.lastSeq+1)failure('GM_SEQUENCE','GM 序列不连续。');
      if(raw.op==='set'&&JSON.stringify(raw.value)===undefined)failure('INVALID_GM','GM 值无法序列化。');
      const row=await request<{values:Record<string,unknown>}|undefined>(tx.objectStore('gm').get(r!.id)),values=Object.assign(Object.create(null),row?.values);
      if(raw.op==='delete')delete values[raw.key!];else values[raw.key!]=raw.value;
      await request(tx.objectStore('gm').put({id:r!.id,values}));lease!.lastSeq=raw.seq!;await request(tx.objectStore('runtimeStatus').put(lease!));return{};
    });
  }
}
