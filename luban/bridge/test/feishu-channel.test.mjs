import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';
import {TaskStore} from '../src/store/task-store.mjs';import {ProfileStore} from '../src/store/profile-store.mjs';import {ClientStore} from '../src/store/client-store.mjs';import {TaskCoordinator} from '../src/task-coordinator.mjs';import {FeishuChannel} from '../src/feishu-channel.mjs';import {ChannelStore} from '../src/channel-store.mjs';
async function fixture(run){const dir=mkdtempSync('/private/tmp/luban-channel-'),tasks=new TaskStore(':memory:'),profiles=new ProfileStore(':memory:'),clients=new ClientStore(profiles);const credentials=profiles.pair('a'.repeat(32)),principal=profiles.authenticate('a'.repeat(32),credentials);const coordinator=new TaskCoordinator(tasks,profiles);const sent=[];let behavior=async()=>({code:0,data:{message_id:'om_test'}});let agentCalls=0;
 const services={tasks,profiles,clients,coordinator,agent:{start:()=>{agentCalls++;return {task:{id:crypto.randomUUID()}};},get:()=>({task:{state:'completed'},text:JSON.stringify({code:'console.log(1)',gmGrants:[],explanation:'test'})}),cancel:()=>{}}};
 const channel=new FeishuChannel(services,dir,{configLoader:()=>({appId:'cli_test',senderOpenId:'ou_test',tenantKey:'tenant_test'}),connectSdk:async()=>({ws:{close(){}},sendText:async body=>{sent.push(body);return behavior();}})});
 await channel.connect(principal);const event=(text,extra={})=>({event_id:crypto.randomUUID(),sender:{sender_type:'user',sender_id:{open_id:'ou_test'},tenant_key:'tenant_test'},message:{message_id:crypto.randomUUID(),chat_type:'p2p',message_type:'text',content:JSON.stringify({text})},...extra});
 try{await run({tasks,profiles,principal,coordinator,channel,event,sent,services,behavior:fn=>{behavior=fn;},agentCalls:()=>agentCalls});}finally{if(channel.state==='connected')await channel.disconnect(principal);tasks.close();profiles.close();rmSync(dir,{recursive:true,force:true});}}
const settle=async channel=>{await Promise.allSettled([...channel.pending]);};
test('revoking the target during generation stops the local agent and cannot submit a late candidate',()=>fixture(async({channel,profiles,principal,coordinator,event,services})=>{
 const page={pageRef:crypto.randomUUID(),workspaceId:crypto.randomUUID(),capabilities:['context.read','tool.read','draft.submit','trial.request']};profiles.syncPages(principal.profileId,[page]);channel.bind(principal,{pageRef:page.pageRef});
 let started=false,cancelled=0;services.agent={start:()=>{started=true;return {task:{id:crypto.randomUUID()}};},get:()=>({task:{state:cancelled?'cancelled':'running'}}),cancel:()=>{cancelled++;}};
 const commands=[];const worker=setInterval(()=>{for(const c of coordinator.pull(principal).commands){commands.push(c.command);coordinator.finish(principal,{taskId:c.taskId,epoch:c.epoch,revision:c.revision,state:'completed',result:c.command==='readTool'?{draftRevision:1,baseline:{code:'baseline'}}:{summary:{title:'test'}}});}},10);
 try{
  channel.receive(event('任务 revoke during generation'));const until=Date.now()+2000;while(!started&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(started,true);
  profiles.clearPages(principal.profileId);await settle(channel);
  assert.equal(cancelled,1);assert.deepEqual(commands,['readTool','readContext']);assert.equal(channel.status(principal).inbox[0].state,'failed');
 }finally{clearInterval(worker);}
}));
test('bound single-user text input is deduplicated by event and message identity; other senders/groups/apps/tenants ignored',()=>fixture(async({channel,event,principal,sent})=>{
 const original=event('任务 做一个按钮');for(const altered of [{...original,sender:{...original.sender,sender_id:{open_id:'ou_other'}}},{...original,message:{...original.message,chat_type:'group'}},{...original,header:{app_id:'cli_other'}},{...original,sender:{...original.sender,tenant_key:'tenant_other'}}])channel.receive(altered);
 assert.equal(channel.status(principal).inbox.length,0);channel.receive(original);channel.receive({...original,event_id:crypto.randomUUID()});channel.receive({...original,message:{...original.message,message_id:crypto.randomUUID()}});await settle(channel);assert.equal(channel.status(principal).inbox.length,1);assert.equal(channel.status(principal).inbox[0].state,'waitingUser');assert.equal(sent.length,1);
}));
test('outbound preview cancel sends nothing; immutable confirm sends once and stores platform identity',()=>fixture(async({channel,principal,sent})=>{
 const cancelled=channel.preview(principal,{text:'edited summary'}).delivery;channel.cancelPreview(principal,{deliveryId:cancelled.id});assert.equal(sent.length,0);
 const preview=channel.preview(principal,{text:'only this approved summary'}).delivery;channel.confirm(principal,{deliveryId:preview.id});assert.throws(()=>channel.confirm(principal,{deliveryId:preview.id}),/DELIVERY_STALE/);await settle(channel);assert.deepEqual(sent,['only this approved summary']);assert.equal(channel.store.delivery(principal.profileId,preview.id).message_id,'om_test');
 assert.throws(()=>channel.preview(principal,{text:'x',recipient:'ou_other'}));
}));
test('known delivery failure retries only delivery; unknown result cannot be blindly resent',()=>fixture(async({channel,principal,behavior,sent,agentCalls})=>{
 behavior(async()=>({code:999}));const delivery=channel.preview(principal,{text:'summary'}).delivery;channel.confirm(principal,{deliveryId:delivery.id});await settle(channel);assert.equal(channel.store.delivery(principal.profileId,delivery.id).state,'failed');
 behavior(async()=>({code:0,data:{message_id:'om_retry'}}));channel.retry(principal,{deliveryId:delivery.id});await settle(channel);assert.equal(sent.length,2);assert.equal(agentCalls(),0);
 behavior(async()=>{throw Error('network response lost');});const unknown=channel.preview(principal,{text:'unknown summary'}).delivery;channel.confirm(principal,{deliveryId:unknown.id});await settle(channel);assert.equal(channel.store.delivery(principal.profileId,unknown.id).state,'unknown');assert.throws(()=>channel.retry(principal,{deliveryId:unknown.id}),/DELIVERY_STALE/);
}));
test('restart converts sending to unknown and running inbox to interrupted without replay',()=>fixture(async({channel,tasks,principal,event,sent})=>{
 const delivery=channel.store.preview(principal.profileId,'not replayed','pending');channel.store.transition(principal.profileId,delivery.id,'pending','sending');
 const row=channel.store.receive({eventId:'event',messageId:'message',profileId:principal.profileId,intent:'task'});channel.store.update(row.id,'running');new ChannelStore(tasks);
 assert.equal(channel.store.delivery(principal.profileId,delivery.id).state,'unknown');assert.equal(channel.store.inbox(row.id).state,'interrupted');assert.equal(sent.length,0);
}));
test('bound task pipeline waits for local approval; failed final delivery retry never reruns generation or browser tasks',()=>fixture(async({channel,profiles,principal,coordinator,event,sent,agentCalls,behavior})=>{
 const page={pageRef:crypto.randomUUID(),workspaceId:crypto.randomUUID(),capabilities:['context.read','tool.read','draft.submit','trial.request']};profiles.syncPages(principal.profileId,[page]);channel.bind(principal,{pageRef:page.pageRef});
 const worker=setInterval(()=>{for(const c of coordinator.pull(principal).commands){let result={};if(c.command==='readTool')result={draftRevision:1,baseline:{code:'PRIVATE_BASELINE'}};if(c.command==='readContext')result={summary:{title:'PRIVATE_CONTEXT'}};if(c.command==='submitDraft')result={draftRevision:2};if(c.command==='requestTrial')result={approvalState:'pending'};coordinator.finish(principal,{taskId:c.taskId,epoch:c.epoch,revision:c.revision,state:c.command==='requestTrial'?'waitingUser':'completed',result});}},10);
 try{channel.receive(event('任务 PRIVATE_INTENT'));const until=Date.now()+4000;while(Date.now()<until&&!channel.status(principal).inbox.some(row=>row.state==='waitingUser'))await new Promise(resolve=>setTimeout(resolve,20));
 const row=channel.status(principal).inbox[0];assert.equal(row.state,'waitingUser');assert.equal(agentCalls(),1);assert.ok(sent.every(body=>!/PRIVATE_|console\.log/.test(body)));assert.equal(coordinator.get(channel.principal,row.task_id).result.approvalState,'pending');
 behavior(async()=>({code:999}));const claimed=coordinator.confirm(principal,{taskId:row.task_id}).task;
 coordinator.finish(principal,{taskId:row.task_id,epoch:claimed.epoch,revision:claimed.revision,state:'completed',result:{receiptId:crypto.randomUUID()}});
 const untilDelivered=Date.now()+2000;while(Date.now()<untilDelivered&&!channel.status(principal).deliveries.some(d=>d.state==='failed'))await new Promise(resolve=>setTimeout(resolve,20));
 const failed=channel.status(principal).deliveries.find(d=>d.state==='failed');assert.ok(failed);behavior(async()=>({code:0,data:{message_id:'om_final_retry'}}));channel.retry(principal,{deliveryId:failed.id});
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(channel.store.delivery(principal.profileId,failed.id).state,'delivered');assert.equal(agentCalls(),1);assert.deepEqual(coordinator.pull(principal).commands,[]);
 }finally{clearInterval(worker);}
}));
test('channel reconnect keeps stable private task ownership but clears the page target',()=>fixture(async({channel,principal})=>{
 const owner=channel.principal.clientId;await channel.disconnect(principal);await channel.connect(principal);assert.equal(channel.principal.clientId,owner);assert.equal(channel.status(principal).target,null);
}));
test('cancelled inbox work cannot continue into generation; query stays scoped to bound profile',()=>fixture(async({channel,profiles,principal,event,agentCalls})=>{
 const page={pageRef:crypto.randomUUID(),workspaceId:crypto.randomUUID(),capabilities:['context.read','tool.read','draft.submit','trial.request']};profiles.syncPages(principal.profileId,[page]);channel.bind(principal,{pageRef:page.pageRef});channel.receive(event('任务 cancel before browser read'));
 const until=Date.now()+1000;let row;while(Date.now()<until){row=channel.status(principal).inbox.find(r=>r.task_id);if(row)break;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(row);
 channel.receive(event('取消 '+row.id));await settle(channel);assert.equal(channel.store.inbox(row.id).state,'cancelled');assert.equal(agentCalls(),0);
}));
