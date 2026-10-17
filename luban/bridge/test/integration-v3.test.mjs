import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';
import {TaskStore} from '../src/store/task-store.mjs';import {ProfileStore} from '../src/store/profile-store.mjs';import {ClientStore} from '../src/store/client-store.mjs';import {TaskCoordinator} from '../src/task-coordinator.mjs';import {AgentService} from '../src/agent-service.mjs';
test('sidepanel agent, MCP and Feishu share a workspace lease; conflicting entries wait and revoked page blocks live work',async()=>{
 const dir=mkdtempSync('/private/tmp/luban-three-entry-'),tasks=new TaskStore(':memory:'),profiles=new ProfileStore(':memory:'),clients=new ClientStore(profiles),coordinator=new TaskCoordinator(tasks,profiles);
 const browser=profiles.authenticate('a'.repeat(32),profiles.pair('a'.repeat(32)));const create=source=>({...clients.authenticate(clients.exchange(clients.enroll(browser,{name:source}).enrollmentCode)),source});const mcp=create('mcp'),feishu=create('feishu');
 const pageRef=crypto.randomUUID(),workspaceId=crypto.randomUUID();profiles.syncPages(browser.profileId,[{pageRef,workspaceId,capabilities:['context.read','tool.read','draft.submit','trial.request']}]);
 let resolve;const done=new Promise(yes=>{resolve=yes;});const service=new AgentService(tasks,dir,{checkVersion:false,runnerFactory:()=>({run:()=>done,cancel:()=>resolve('cancelled output')})});
 try{
  const agent=service.start(browser,{workspaceId,requestKey:'agent',messages:[{role:'user',content:'test'}]});
  const first=coordinator.submit(mcp,{workspaceId,pageRef,command:'readTool',expectedDraftRevision:0,requestKey:'mcp'});const second=coordinator.submit(feishu,{workspaceId,pageRef,command:'readTool',expectedDraftRevision:0,requestKey:'feishu'});
  assert.deepEqual(coordinator.pull(browser).commands,[]);resolve('complete');await new Promise(yes=>setTimeout(yes,0));assert.equal(service.get(browser,{taskId:agent.task.id}).task.state,'completed');
  const commands=coordinator.pull(browser).commands;assert.equal(commands.length,1);const active=commands[0];assert.ok(['mcp','feishu'].includes(active.source));assert.equal(tasks.get(active.taskId===first.task.id?second.task.id:first.task.id).state,'queued');
  coordinator.finish(browser,{taskId:active.taskId,epoch:active.epoch,revision:active.revision,state:'completed',result:{draftRevision:0,baseline:null}});
  const next=coordinator.pull(browser).commands[0];assert.notEqual(next.source,active.source);assert.notEqual(next.taskId,active.taskId);profiles.clearPages(browser.profileId);
  assert.throws(()=>coordinator.check(browser,{taskId:next.taskId,epoch:next.epoch,revision:next.revision}),/PAGE_NOT_GRANTED/);
 }finally{await service.close();tasks.close();profiles.close();rmSync(dir,{recursive:true,force:true});}
});
