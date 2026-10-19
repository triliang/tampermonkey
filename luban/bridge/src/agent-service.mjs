import {mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AgentProcess} from './agent-process.mjs';
import {inspectCodex,CODEX_BIN} from './codex-capabilities.mjs';
export {CODEX_BIN} from './codex-capabilities.mjs';
import {protocolError} from './protocol.mjs';

const startSchema=z.object({workspaceId:z.string().uuid(),requestKey:z.string().min(1).max(128),messages:z.array(z.object({role:z.enum(['system','user','assistant']),content:z.string().max(250000)}).strict()).min(1).max(30)}).strict();
export class AgentService{
 constructor(tasks,dir,{bin=CODEX_BIN,runnerFactory=options=>new AgentProcess(options),checkVersion=true}={}){
  this.tasks=tasks;this.db=tasks.db;this.dir=join(dir,'agent-work');this.bin=bin;this.runnerFactory=runnerFactory;this.checkVersion=checkVersion;this.active=new Map();
  this.db.exec('CREATE TABLE IF NOT EXISTS agent_runs(task_id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,output TEXT,error TEXT,UNIQUE(profile_id,request_key))');
  for(const row of this.db.prepare('SELECT task_id FROM agent_runs').all()){const task=tasks.get(row.task_id);if(task&&['queued','running','cancelRequested'].includes(task.state))tasks.interrupt(task.id,'AGENT_RESTARTED');}
 }
 status(){return inspectCodex(this.bin);}

 owned(principal,id){const row=this.db.prepare('SELECT * FROM agent_runs WHERE task_id=? AND profile_id=?').get(id,principal.profileId);if(!row)throw protocolError('TASK_MISSING');return row;}
 get(principal,raw){const {taskId}=z.object({taskId:z.string().uuid()}).strict().parse(raw);const row=this.owned(principal,taskId),task=this.tasks.get(taskId),running=this.active.get(taskId);return {task:{id:task.id,state:task.state},...(task.state==='completed'?{text:row.output}:{}),...(row.error?{error:row.error}:{}),progress:running?.progress??'',historyMode:'latest-baseline-new-thread'};}
 start(principal,raw){const input=startSchema.parse(raw),json=JSON.stringify(input);if(Buffer.byteLength(json)>280*1024)throw protocolError('AGENT_INPUT_TOO_LARGE');const hash=createHash('sha256').update(json).digest('hex');const old=this.db.prepare('SELECT * FROM agent_runs WHERE profile_id=? AND request_key=?').get(principal.profileId,input.requestKey);if(old){if(old.payload_hash!==hash)throw protocolError('REQUEST_CONFLICT');return this.get(principal,{taskId:old.task_id});}
  mkdirSync(this.dir,{recursive:true,mode:0o700});
  if(this.checkVersion){const status=this.status();if(!status.compatible||!status.restrictionsApplied)throw protocolError('AGENT_VERSION_OR_POLICY_UNAVAILABLE');}
  if(this.active.size>=4)throw protocolError('AGENT_CAPACITY');mkdirSync(this.dir,{recursive:true,mode:0o700});const cwd=join(this.dir,randomUUID());mkdirSync(cwd,{mode:0o700});const id=randomUUID();let task;
  this.tasks.mutate(()=>{this.tasks.create({id,workspaceId:input.workspaceId,source:'sidepanel',kind:'generate'});task=this.tasks.claim(id,{ttlMs:300000});this.db.prepare('INSERT INTO agent_runs(task_id,profile_id,request_key,payload_hash) VALUES(?,?,?,?)').run(id,principal.profileId,input.requestKey,hash);});
  const runner=this.runnerFactory({bin:this.bin,cwd}),entry={runner,profileId:principal.profileId,progress:''};this.active.set(id,entry);
  entry.done=runner.run(input.messages,text=>{if(this.tasks.get(id)?.state==='running')entry.progress=text.slice(-16000);}).then(text=>{if(Buffer.byteLength(text)>300*1024)throw protocolError('AGENT_OUTPUT_TOO_LARGE');this.tasks.mutate(()=>{this.tasks.finish(id,task.epoch,task.revision);this.db.prepare('UPDATE agent_runs SET output=? WHERE task_id=?').run(text,id);this.tasks.markResolved(id);});}).catch(error=>{
   const current=this.tasks.get(id);if(current?.state==='cancelRequested'){this.tasks.confirmCancelled(id,task.epoch);this.tasks.markResolved(id);}else if(current?.state==='running'){this.tasks.finish(id,task.epoch,task.revision,{state:'failed'});this.tasks.markResolved(id);}
   this.db.prepare('UPDATE agent_runs SET error=? WHERE task_id=?').run(/^[A-Z_]{2,64}$/.test(error.code??'')?error.code:'AGENT_FAILED',id);
  }).finally(()=>{this.active.delete(id);rmSync(cwd,{recursive:true,force:true});});return this.get(principal,{taskId:id});
 }
 cancel(principal,raw){const {taskId}=z.object({taskId:z.string().uuid()}).strict().parse(raw);this.owned(principal,taskId);this.tasks.cancel(taskId);this.active.get(taskId)?.runner.cancel();return this.get(principal,{taskId});}
 disconnected(profileId){for(const [taskId,entry] of this.active)if(entry.profileId===profileId)this.cancel({profileId},{taskId});}
 async close(){for(const [id,entry] of this.active)this.cancel({profileId:entry.profileId},{taskId:id});await Promise.allSettled([...this.active.values()].map(entry=>entry.done));}
}
