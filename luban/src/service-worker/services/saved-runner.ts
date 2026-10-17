import {pageMatchesScript,type ScriptStore} from '../script-store';
import type {CapturedPage,PageBinding} from '../../shared/p2-types';
import type {ScriptRecord,ScriptVersion,WorkspaceRecord} from '../../shared/v2-types';
import type {TrialResult} from '../../shared/p3-types';
import type {TrialOperation} from '../repositories/trial-operation';
import {DataError,request} from '../repositories/database';
import {assertWorkspaceOwner,withWorkspaceLock,workerId} from './workspace-lock';
import {validateTrial,draftHash} from './trial-runner';

type Executor=(binding:PageBinding,version:ScriptVersion,namespace:string,hash:string,values:Record<string,unknown>)=>Promise<TrialResult>;
export class SavedRunner{
 constructor(private store:ScriptStore,private capture:()=>Promise<CapturedPage>,private execute:Executor){}
 async run(scriptId:string,operationId:string){
  if(!operationId||operationId.length>128)throw new DataError('INVALID_OPERATION','运行操作编号无效。');
  await this.store.ready();const workspaceId='script:'+scriptId,key='saved:'+operationId;
  return withWorkspaceLock(workspaceId,async owner=>{
   let executing=false;
   try{
    const record=await this.store.record(scriptId);if(!record||record.tombstone)throw new DataError('SCRIPT_MISSING','保存版不存在。');
    validateTrial(record.current);const hash=await draftHash(record.current),page=await this.capture();
    if(record.host?page.binding.host!==record.host:!pageMatchesScript(page.binding.url,record.matches))throw new DataError('WRONG_PAGE','请先打开工具适用网站。');
    await this.store.db.mutate(async tx=>{
     await assertWorkspaceOwner(tx,workspaceId,owner);
     const current=await request<ScriptRecord>(tx.objectStore('scripts').get(scriptId));if(current.recordRevision!==record.recordRevision)throw new DataError('REVISION_CONFLICT','保存版已变化。');
     const related=(await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll())).filter(ws=>ws.scriptId===scriptId);
     for(const ws of related){const lease=await request<{token:string;expiresAt:number}|undefined>(tx.objectStore('workspaceLeases').get(ws.id));if(lease?.token&&lease.expiresAt>Date.now())throw new DataError('WORKSPACE_BUSY','此工具的工作区正在处理。');}
     const operations=await request<TrialOperation[]>(tx.objectStore('approvals').getAll());
     if(operations.some(op=>op.id===key))throw new DataError('APPROVAL_ALREADY_CONSUMED','此运行操作已使用，不会重复执行。');
     if(operations.some(op=>(op.workspaceId===workspaceId||related.some(ws=>ws.id===op.workspaceId))&&['executing','unknown'].includes(op.state)))throw new DataError('RECOVERY_REQUIRED','此工具有未知操作，请先核对页面。');
     if((await request<Array<{scriptId:string}>>(tx.objectStore('operations').getAll())).some(op=>op.scriptId===scriptId))throw new DataError('RECOVERY_REQUIRED','工具有待恢复的版本操作。');
     const operation:TrialOperation={id:key,workspaceId,ownerToken:owner.token,workerId,draftRevision:record.recordRevision,codeHash:hash,binding:page.binding,state:'executing',createdAt:Date.now(),updatedAt:Date.now()};
     await request(tx.objectStore('approvals').add(operation));
    });
    executing=true;const result=await this.execute(page.binding,record.current,scriptId,hash,await this.store.readGm(scriptId));
    if(!result||typeof result.ok!=='boolean'||!Array.isArray(result.changes))throw new DataError('INVALID_RESULT','运行回执无效。');
    await this.store.db.mutate(async tx=>{
     await assertWorkspaceOwner(tx,workspaceId,owner);const current=await request<ScriptRecord>(tx.objectStore('scripts').get(scriptId));if(current.recordRevision!==record.recordRevision)throw new DataError('REVISION_CONFLICT','执行期间保存版已变化。');
     const gm=await request<{values:Record<string,unknown>}|undefined>(tx.objectStore('gm').get(scriptId)),values=Object.assign(Object.create(null),gm?.values);
     for(const change of result.changes){if(typeof change.key!=='string'||!['set','delete'].includes(change.op))throw new DataError('INVALID_GM','GM 回执无效。');if(change.op==='delete')delete values[change.key];else values[change.key]=change.value;}
     await request(tx.objectStore('gm').put({id:scriptId,values}));const operation=await request<TrialOperation>(tx.objectStore('approvals').get(key));operation.state=result.timedOut?'unknown':result.ok?'completed':'failed';operation.updatedAt=Date.now();await request(tx.objectStore('approvals').put(operation));
    });executing=false;
    if(result.timedOut)throw new DataError('TRIAL_OUTCOME_UNKNOWN','运行超时，结果未知；请检查页面，操作不会自动重跑。');
    return result;
   }catch(error){if(executing){await this.store.db.mutate(async tx=>{const operation=await request<TrialOperation|undefined>(tx.objectStore('approvals').get(key));if(operation){operation.state=error instanceof DataError&&error.code==='USER_SCRIPTS_REQUIRED'?'failed':'unknown';operation.updatedAt=Date.now();await request(tx.objectStore('approvals').put(operation));}}).catch(()=>{});if(!(error instanceof DataError&&error.code==='USER_SCRIPTS_REQUIRED'))throw new DataError('TRIAL_OUTCOME_UNKNOWN','运行结果未知，请先核对页面。');}throw error;}
  },this.store.db,'runSaved');
 }
}
