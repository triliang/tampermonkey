import type {LocalTask,LocalTasksReply} from '../../shared/bridge-types';
import {getScriptStore} from '../script-store';
import {request,DataError} from '../repositories/database';
import type {TrialOperation} from '../repositories/trial-operation';
import {settleTask} from '../repositories/task-journal';
export async function localTasks(raw:unknown,store=getScriptStore()):Promise<LocalTasksReply>{
 const message=raw as {action?:string;id?:string;reviewed?:boolean};if(!['list','prune','reviewUnknown','reviewTask'].includes(message.action??''))throw new DataError('INVALID_MESSAGE','任务操作无效。');
 await store.ready();let pruned=0;
 if(message.action==='reviewTask'){
  if(typeof message.id!=='string'||message.reviewed!==true)throw new DataError('REVIEW_REQUIRED','请先核对任务状态。');
  await store.db.mutate(async tx=>{const task=await request<LocalTask|undefined>(tx.objectStore('tasks').get(message.id!));if(!task||task.state!=='waitingUser')throw new DataError('TASK_STALE','任务状态已变化。');const operations=await request<TrialOperation[]>(tx.objectStore('approvals').getAll());if(operations.some(op=>op.ownerToken===task.id&&['unknown','executing'].includes(op.state)))throw new DataError('RECOVERY_REQUIRED','请先核对上方的未知网页操作。');await settleTask(tx,task.id,'failed','UNKNOWN_REVIEWED');});
 }
 if(message.action==='reviewUnknown'){
  if(typeof message.id!=='string'||message.reviewed!==true)throw new DataError('REVIEW_REQUIRED','请先人工核对页面结果。');
  await store.db.mutate(async tx=>{const operation=await request<TrialOperation|undefined>(tx.objectStore('approvals').get(message.id!));if(!operation||operation.state!=='unknown')throw new DataError('OPERATION_STALE','操作状态已变化，请刷新记录。');operation.state='reviewed';operation.updatedAt=Date.now();await request(tx.objectStore('approvals').put(operation));await settleTask(tx,operation.ownerToken,'failed','UNKNOWN_REVIEWED');});
 }
 if(message.action==='prune')pruned=await store.db.mutate(async tx=>{
  const cutoff=Date.now()-30*86400000;
  const protectedTasks=new Set((await request<Array<{ownerToken?:string;state:string}>>(tx.objectStore('approvals').getAll())).filter(op=>['unknown','executing'].includes(op.state)).map(op=>op.ownerToken));
  const stale=(await request<LocalTask[]>(tx.objectStore('tasks').getAll())).filter(task=>['completed','failed','cancelled'].includes(task.state)&&task.updatedAt<cutoff&&!protectedTasks.has(task.id));const ids=new Set(stale.map(task=>task.id));
  for(const task of stale)await request(tx.objectStore('tasks').delete(task.id));
  for(const event of await request<Array<{id:string;taskId:string}>>(tx.objectStore('taskEvents').getAll()))if(ids.has(event.taskId))await request(tx.objectStore('taskEvents').delete(event.id));
  const active=new Set((await request<LocalTask[]>(tx.objectStore('tasks').getAll())).filter(task=>['running','cancelRequested','waitingUser'].includes(task.state)).map(task=>task.id));
  for(const operation of await request<TrialOperation[]>(tx.objectStore('approvals').getAll()))if(['completed','failed','reviewed'].includes(operation.state)&&operation.updatedAt<cutoff&&!active.has(operation.ownerToken))await request(tx.objectStore('approvals').delete(operation.id));
  const metadata=await request<Array<{id:string;state?:string;acknowledged?:boolean;updatedAt?:number;createdAt?:number}>>(tx.objectStore('meta').getAll());
  for(const row of metadata){
    const age=row.updatedAt??row.createdAt??Date.now();if(age>=cutoff)continue;
    const removable=row.id.startsWith('v3:conflict:')||row.id.startsWith('v3:dispatch:')&&row.acknowledged&&['completed','failed'].includes(row.state??'')||row.id.startsWith('v3:approval:')&&['completed','failed','rejected','expired','reviewed'].includes(row.state??'');
    if(removable)await request(tx.objectStore('meta').delete(row.id));
  }
  return stale.length;
 });
 const tasks=(await store.db.all<LocalTask>('tasks')).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,50);
 const unknownOperations=(await store.db.all<TrialOperation>('approvals')).filter(op=>op.state==='unknown').map(op=>({id:op.id,workspaceId:op.workspaceId,documentId:op.binding.documentId,draftRevision:op.draftRevision,createdAt:op.createdAt}));
 return {ok:true,data:{tasks,unknownOperations,...(message.action==='prune'?{pruned}:{})}};
}
