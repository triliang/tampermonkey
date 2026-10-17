import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {TaskStore} from '../src/store/task-store.mjs';import {AgentService} from '../src/agent-service.mjs';
async function fixture(run){const dir=mkdtempSync('/private/tmp/luban-agent-'),tasks=new TaskStore(':memory:');const runners=[];const service=new AgentService(tasks,dir,{checkVersion:false,runnerFactory:()=>{let resolve,reject;const result=new Promise((a,b)=>{resolve=a;reject=b;});const runner={run:()=>result,cancel:()=>reject(Object.assign(Error('CANCELLED'),{code:'CANCELLED'})),resolve,reject};runners.push(runner);return runner;}});const principal={profileId:crypto.randomUUID()};const input={workspaceId:crypto.randomUUID(),requestKey:'one',messages:[{role:'user',content:'Return JSON'}]};try{await run({tasks,service,runners,principal,input});}finally{await service.close();tasks.close();rmSync(dir,{recursive:true,force:true});}}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('dedicated agent tasks use stable identity and profile ownership; completed output survives service recreation',()=>fixture(async({tasks,service,runners,principal,input})=>{
 const first=service.start(principal,input);assert.equal(service.start(principal,input).task.id,first.task.id);assert.throws(()=>service.start(principal,{...input,messages:[{role:'user',content:'different'}]}),/REQUEST_CONFLICT/);
 assert.throws(()=>service.get({profileId:crypto.randomUUID()},{taskId:first.task.id}),/TASK_MISSING/);
 runners[0].resolve('{"code":"console.log(1)"}');await tick();assert.equal(service.get(principal,{taskId:first.task.id}).task.state,'completed');
 const resumed=new AgentService(tasks,service.dir,{checkVersion:false});assert.equal(resumed.get(principal,{taskId:first.task.id}).text,'{"code":"console.log(1)"}');
}));
test('agent cancel is pending until stop and late output never becomes a completed artifact',()=>fixture(async({service,runners,principal,input})=>{
 const created=service.start(principal,input);assert.equal(service.cancel(principal,{taskId:created.task.id}).task.state,'cancelRequested');runners[0].resolve('late');await tick();const stopped=service.get(principal,{taskId:created.task.id});assert.equal(stopped.task.state,'cancelled');assert.equal('text' in stopped,false);
}));
test('restarted agent tasks become waitingUser and are not replayed; malformed inputs create no task',()=>fixture(async({tasks,service,runners,principal,input})=>{
 assert.throws(()=>service.start(principal,{...input,messages:[{role:'user',content:'a'.repeat(250001)}]}));assert.equal(runners.length,0);
 const created=service.start(principal,input);new AgentService(tasks,service.dir,{checkVersion:false});assert.equal(service.get(principal,{taskId:created.task.id}).task.state,'waitingUser');runners[0].resolve('late');await tick();assert.equal('text' in service.get(principal,{taskId:created.task.id}),false);
}));
