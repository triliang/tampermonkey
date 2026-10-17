import type {GenerationTransport} from './workspace-generation';
import type {ProviderConfig} from '../../shared/types';
import type {ChatMessage} from '../ai-providers/base';
import {DataError} from '../repositories/database';
type Rpc=(method:string,params?:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export class AgentTransport implements GenerationTransport{
 private taskId?:string;private cancelled=false;
 constructor(private rpc:Rpc,private workspaceId:string){}
 cancel(){this.cancelled=true;if(this.taskId)void this.rpc('agent.cancel',{taskId:this.taskId}).catch(()=>{});}
 async waitForStop(){const until=Date.now()+20000;while(Date.now()<until){if(this.taskId){const reply=await this.rpc('agent.get',{taskId:this.taskId});const state=(reply.task as {state:string}).state;if(state==='waitingUser')throw new DataError('AGENT_CANCEL_UNKNOWN','停止结果未知，请核对本地 Agent 状态；原草稿保留。');if(['completed','failed','cancelled'].includes(state))return;}await new Promise(resolve=>setTimeout(resolve,200));}throw new DataError('AGENT_CANCEL_PENDING','已请求停止，尚未收到本地 Agent 终止确认；请查看连接状态。');}
 async generate(_config:ProviderConfig,messages:ChatMessage[],_options:unknown,callbacks:Parameters<GenerationTransport['generate']>[3]){
  const started=await this.rpc('agent.start',{workspaceId:this.workspaceId,requestKey:crypto.randomUUID(),messages});
  const task=started.task as {id:string};if(!task?.id)throw new DataError('AGENT_PROTOCOL_INVALID','本地 Agent 返回无效任务。');this.taskId=task.id;
  if(this.cancelled)await this.rpc('agent.cancel',{taskId:task.id});
  const deadline=Date.now()+200000;let progress='';
  while(Date.now()<deadline){
   const data=await this.rpc('agent.get',{taskId:task.id});const current=data.task as {state:string};
   if(this.cancelled&&['completed','failed','cancelled','waitingUser'].includes(current.state))throw new DataError('CANCELLED','本地 Agent 已停止，原草稿保留。');
   if(!this.cancelled&&typeof data.progress==='string'&&data.progress!==progress){progress=data.progress;callbacks.onDelta(progress);}
   if(current.state==='completed'&&typeof data.text==='string')return {text:data.text,finishReason:'stop'};
   if(['failed','cancelled','waitingUser'].includes(current.state))throw new DataError(String(data.error??'AGENT_INTERRUPTED'),'本地 Agent 不可用或请求中断：'+String(data.error??current.state)+'。请检查登录、版本或额外权限；原草稿保留。');
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  this.cancel();throw new DataError('AGENT_TIMEOUT','本地 Agent 超时，已请求停止，原草稿保留。');
 }
}
