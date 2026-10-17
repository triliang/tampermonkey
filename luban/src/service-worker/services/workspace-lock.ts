import type {LocalTask} from '../../shared/bridge-types';
import {startTask,settleTask,type TaskState} from '../repositories/task-journal';
import {DataError, Database, request} from '../repositories/database';
export interface WorkspaceOwner {token:string;epoch:number;workerId:string;}
interface Lease extends WorkspaceOwner {id:string;expiresAt:number;}
export type WorkspaceRelease=((state?:TaskState,errorCode?:string)=>Promise<void>)&{owner:WorkspaceOwner};
export const workerId=crypto.randomUUID();
const locks=new Map<string,symbol>();
export const workspaceLocked=(id:string)=>locks.has(id);
export async function assertWorkspaceOwner(tx:IDBTransaction,id:string,owner?:WorkspaceOwner):Promise<void>{
 const workspace=await request<{scriptId?:string}|undefined>(tx.objectStore('workspaces').get(id));
 if(workspace?.scriptId)await assertScriptExecutionIdle(tx,workspace.scriptId);
 const lease=await request<Lease|undefined>(tx.objectStore('workspaceLeases').get(id));
 if(owner){if(!lease||lease.token!==owner.token||lease.epoch!==owner.epoch||lease.workerId!==owner.workerId||lease.expiresAt<=Date.now())throw new DataError('TASK_STALE','任务所有者或租约已失效，结果未写入。');}
 else if(lease?.token&&lease.expiresAt>Date.now())throw new DataError('WORKSPACE_BUSY','当前工作区正在处理，请等待或取消。');
}
export async function assertScriptExecutionIdle(tx:IDBTransaction,scriptId:string):Promise<void>{
 const lease=await request<Lease|undefined>(tx.objectStore('workspaceLeases').get('script:'+scriptId));
 if(lease?.token&&lease.expiresAt>Date.now())throw new DataError('WORKSPACE_BUSY','保存版正在执行，请等待。');
 const operations=await request<Array<{workspaceId:string;state:string}>>(tx.objectStore('approvals').getAll());
 if(operations.some(op=>op.workspaceId==='script:'+scriptId&&['executing','unknown'].includes(op.state)))throw new DataError('RECOVERY_REQUIRED','保存版执行结果未知，请先核对页面。');
}
export async function lockWorkspace(id:string,db:Database,kind='operation',source:LocalTask['source']='sidepanel'):Promise<WorkspaceRelease>{
 if(locks.has(id))throw new DataError('WORKSPACE_BUSY','当前工具正在处理，请等待或取消。');
 const marker=Symbol(id);locks.set(id,marker);let owner:WorkspaceOwner;
 try{owner=await db.mutate(async tx=>{await assertWorkspaceOwner(tx,id);const store=tx.objectStore('workspaceLeases');const prior=await request<Lease|undefined>(store.get(id));if(prior?.token&&prior.expiresAt>Date.now())throw new DataError('WORKSPACE_BUSY','另一个任务持有此工作区。');if(prior?.token)await settleTask(tx,prior.token,'waitingUser','LEASE_EXPIRED');const next:Lease={id,token:crypto.randomUUID(),epoch:(prior?.epoch??0)+1,workerId,expiresAt:Date.now()+60000};await request(store.put(next));await startTask(tx,next.token,id,kind,next.epoch,workerId,source);return {token:next.token,epoch:next.epoch,workerId};});}
 catch(e){if(locks.get(id)===marker)locks.delete(id);throw e;}
 let released=false;
 const timer=setInterval(()=>{void db.mutate(async tx=>{await assertWorkspaceOwner(tx,id,owner);const store=tx.objectStore('workspaceLeases');const lease=await request<Lease>(store.get(id));lease.expiresAt=Date.now()+60000;await request(store.put(lease));}).catch(()=>{clearInterval(timer);});},15000);
 const release=async(state:TaskState='completed',errorCode?:string)=>{const first=!released;released=true;clearInterval(timer);try{await db.mutate(async tx=>{await settleTask(tx,owner.token,state,errorCode);if(!first)return;const store=tx.objectStore('workspaceLeases');const lease=await request<Lease|undefined>(store.get(id));if(lease?.token===owner.token&&lease.epoch===owner.epoch){lease.token='';lease.expiresAt=0;await request(store.put(lease));}});}finally{if(locks.get(id)===marker)locks.delete(id);}};
 return Object.assign(release,{owner});
}
export async function withWorkspaceLock<T>(id:string,action:(owner:WorkspaceOwner)=>Promise<T>,db:Database,kind='operation',source:LocalTask['source']='sidepanel'):Promise<T>{const release=await lockWorkspace(id,db,kind,source);let state:TaskState='completed',errorCode:string|undefined;try{return await action(release.owner);}catch(e){errorCode=e instanceof DataError?e.code:'OPERATION_FAILED';state=errorCode==='TRIAL_OUTCOME_UNKNOWN'?'waitingUser':'failed';throw e;}finally{await release(state,errorCode);}}
