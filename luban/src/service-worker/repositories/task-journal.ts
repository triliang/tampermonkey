import {request} from './database';
import type {LocalTask,LocalTaskState} from '../../shared/bridge-types';
export type TaskState=LocalTaskState;
export async function appendTask(tx:IDBTransaction,task:LocalTask,type:string):Promise<void>{
 task.seq++;task.updatedAt=Date.now();
 await request(tx.objectStore('tasks').put(task));
 await request(tx.objectStore('taskEvents').put({id:`${task.id}:${task.seq}`,taskId:task.id,seq:task.seq,type,state:task.state,createdAt:task.updatedAt,...(task.errorCode?{errorCode:task.errorCode}:{})}));
}
export async function startTask(tx:IDBTransaction,id:string,workspaceId:string,kind:string,epoch:number,workerId:string,source:LocalTask['source']='sidepanel'){const task:LocalTask={id,workspaceId,workerId,source,kind,epoch,state:'running',seq:0,createdAt:Date.now(),updatedAt:Date.now()};await appendTask(tx,task,'started');}
export async function settleTask(tx:IDBTransaction,id:string,state:TaskState,errorCode?:string){const task=await request<LocalTask|undefined>(tx.objectStore('tasks').get(id));if(!task||['completed','failed','cancelled'].includes(task.state)||task.state===state||(task.state==='waitingUser'&&errorCode!=='UNKNOWN_REVIEWED'))return;task.state=state;if(errorCode&&/^[A-Z0-9_]{1,64}$/.test(errorCode))task.errorCode=errorCode;await appendTask(tx,task,state);}
