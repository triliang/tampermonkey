import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,chmodSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startDaemon,openDaemon} from '../src/local-daemon.mjs';
import {encodeFrame,FrameDecoder} from '../src/native-framing.mjs';
import {enrollMcpClient} from '../src/mcp-enrollment.mjs';
import {readMcpConfig} from '../src/mcp-connection.mjs';

function rpc(socket,method,params={}){
 return new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID(),decoder=new FrameDecoder();
  const timer=setTimeout(()=>{socket.off('data',onData);reject(Error('TEST_TIMEOUT'));},2000);
  const onData=chunk=>{for(const reply of decoder.push(chunk))if(reply.requestId===requestId){clearTimeout(timer);socket.off('data',onData);resolve(reply);}};
  socket.on('data',onData);socket.write(encodeFrame({protocolVersion:1,requestId,method,params}));
 });
}
async function fixture(run){
 const dir=mkdtempSync('/private/tmp/luban-s2-'),origin=`chrome-extension://${'a'.repeat(32)}/`,config=join(dir,'client.json');
 const daemon=startDaemon({dir,allowedOrigins:[origin]});let browser,other,client;
 try{
  await daemon.ready;browser=await openDaemon(dir,origin);other=await openDaemon(dir,origin);await rpc(browser,'profile.pair');await rpc(other,'profile.pair');
  const enrollment=(await rpc(browser,'clients.enroll',{name:'SDK test'})).data;await enrollMcpClient(config,enrollment.enrollmentCode,{stateDir:dir});
  const transport=()=>new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/mcp-entry.mjs',import.meta.url)),config,dir],stderr:'pipe'});
  const reconnect=async()=>{client=new Client({name:'luban-s2-sdk-test',version:'1'});await client.connect(transport());return client;};
  await reconnect();
  await run({dir,config,browser,other,client,reconnect,call:(name,args={})=>client.callTool({name,arguments:args})});
 }finally{await client?.close();browser?.destroy();other?.destroy();await daemon.close();rmSync(dir,{recursive:true,force:true});}
}
const data=reply=>reply.structuredContent??JSON.parse(reply.content[0].text);
async function grant(browser){const page={pageRef:crypto.randomUUID(),workspaceId:crypto.randomUUID(),browserSession:crypto.randomUUID(),documentId:'s2-document',navigationEpoch:1,title:'Disposable',url:'https://example.com',capabilities:['context.read','tool.read','draft.submit','trial.request']};assert.equal((await rpc(browser,'pages.sync',{pages:[page]})).ok,true);return page;}

test('seven MCP tools use newline stdio, start empty, expose mapped references and reject forged/cross-profile references',()=>fixture(async({browser,other,client,call})=>{
 const tools=await client.listTools();assert.equal(tools.tools.length,7);assert.ok(tools.tools.every(tool=>!/(execute|save|delete|dispatch)/.test(tool.name)));
 assert.deepEqual(data(await call('luban_list_pages')).pages,[]);
 const page=await grant(browser);await grant(other);const publicPage=data(await call('luban_list_pages')).pages[0];
 assert.equal(publicPage.pageRef,page.pageRef);assert.equal('workspaceId' in publicPage,false);assert.equal(publicPage.toolRefs.length,1);assert.notEqual(publicPage.toolRefs[0],page.workspaceId);
 const denied=await call('luban_get_tool',{toolRef:crypto.randomUUID()});assert.equal(denied.isError,true);assert.equal(data(denied).error.code,'TOOL_NOT_GRANTED');
 const wrong=await call('luban_request_trial',{toolRef:publicPage.toolRefs[0],pageRef:crypto.randomUUID(),draftRevision:0,requestKey:'wrong-page'});assert.equal(wrong.isError,true);
 const badMethod=await client.callTool({name:'luban_execute_js',arguments:{code:'alert(1)'}});assert.equal(badMethod.isError,true);
}));
test('MCP candidate task identity survives RPC ids/reconnect; read baselines are complete and revocation hides cached code',()=>fixture(async({browser,client,call,reconnect})=>{
 const page=await grant(browser),toolRef=data(await call('luban_list_pages')).pages[0].toolRefs[0];
 const args={toolRef,requestKey:'candidate-one',expectedDraftRevision:0,code:'console.log("candidate")',grants:[],explanation:'test'};
 const first=data(await call('luban_submit_draft',args)),again=data(await call('luban_submit_draft',args));assert.equal(first.task.taskId,again.task.taskId);
 const command=(await rpc(browser,'tasks.pull')).data.commands[0];assert.equal(command.workspaceId,page.workspaceId);
 await rpc(browser,'tasks.finish',{taskId:command.taskId,epoch:command.epoch,revision:command.revision,state:'completed',result:{workspaceId:page.workspaceId,draftRevision:1}});
 const complete=data(await call('luban_get_task',{taskId:command.taskId,afterSeq:0}));assert.equal(complete.task.state,'completed');assert.equal('workspaceId' in complete.result,false);assert.ok(complete.events.length>=3);
 await client.close();await reconnect();assert.equal(data(await call('luban_get_task',{taskId:command.taskId})).task.state,'completed');
 const reading=data(await call('luban_get_tool',{toolRef,requestKey:'read-one'}));const readCommand=(await rpc(browser,'tasks.pull')).data.commands[0];assert.equal(readCommand.command,'readTool');
 await rpc(browser,'tasks.finish',{taskId:readCommand.taskId,epoch:readCommand.epoch,revision:readCommand.revision,state:'completed',result:{draftRevision:1,baseline:{code:'console.log("private granted code")',grants:[]}}});
 assert.equal(data(await call('luban_get_task',{taskId:reading.task.taskId})).result.baseline.code,'console.log("private granted code")');
 await rpc(browser,'pages.sync',{pages:[]});assert.equal(data(await call('luban_get_task',{taskId:reading.task.taskId})).result,null);
}));
test('stdio close cancels in-flight work, fences late completion and permits reconnecting to the cancelled task',()=>fixture(async({browser,client,call,reconnect})=>{
 await grant(browser);const toolRef=data(await call('luban_list_pages')).pages[0].toolRefs[0];
 const created=data(await call('luban_submit_draft',{toolRef,requestKey:'cancel-on-close',expectedDraftRevision:0,code:'console.log(1)',grants:[],explanation:''}));
 const command=(await rpc(browser,'tasks.pull')).data.commands[0];await client.close();
 let checked;for(let attempt=0;attempt<30;attempt++){checked=await rpc(browser,'tasks.get',{taskId:command.taskId});if(checked.data.task.state==='cancelRequested')break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.equal(checked.data.task.state,'cancelRequested');assert.equal((await rpc(browser,'tasks.finish',{taskId:command.taskId,epoch:command.epoch,revision:command.revision,state:'completed',result:{}})).ok,false);
 await rpc(browser,'tasks.cancelAck',{taskId:command.taskId,epoch:command.epoch});await reconnect();assert.equal(data(await call('luban_get_task',{taskId:created.task.taskId})).task.state,'cancelled');
}));
test('private connection files reject broad permissions, malformed content and overwrite without exposing credentials',()=>fixture(async({config,dir,browser})=>{
 const credentials=readMcpConfig(config);assert.ok(credentials.clientId);chmodSync(config,0o644);assert.throws(()=>readMcpConfig(config),/MCP_CONFIG_UNSAFE/);chmodSync(config,0o600);
 const invalid=join(dir,'bad.json');writeFileSync(invalid,'not-json-sensitive-content',{mode:0o600});assert.throws(()=>readMcpConfig(invalid),/^Error: MCP_CONFIG_INVALID$/);
 const enrollment=(await rpc(browser,'clients.enroll',{name:'No overwrite'})).data;
 await assert.rejects(enrollMcpClient(config,enrollment.enrollmentCode,{stateDir:dir}),{code:'EEXIST'});
 const linked=join(dir,'linked.json');symlinkSync(config,linked);assert.throws(()=>readMcpConfig(linked),/MCP_CONFIG_UNSAFE/);
}));
test('MCP schema rejects extra fields, oversized UTF-8 code and missing business identity before creating tasks',()=>fixture(async({browser,call})=>{
 await grant(browser);const toolRef=data(await call('luban_list_pages')).pages[0].toolRefs[0];
 const valid={toolRef,requestKey:'schema',expectedDraftRevision:0,code:'console.log(1)',grants:[],explanation:''};
 for(const args of [{...valid,workspaceId:crypto.randomUUID()},{...valid,expectedDraftRevision:-1},{...valid,requestKey:undefined},{...valid,code:'汉'.repeat(90000)}]){
  assert.equal((await call('luban_submit_draft',args)).isError,true);
 }
 assert.deepEqual((await rpc(browser,'tasks.pull')).data.commands,[]);
 for(const name of ['luban_save_tool','luban_delete_tool','luban_restore_tool','luban_dispatch','luban_approve_trial'])assert.equal((await call(name)).isError,true);
}));
test('read-only page grants reveal no tool reference; tool reference expires when rebound to another workspace',()=>fixture(async({browser,call})=>{
 const page=await grant(browser);const initial=data(await call('luban_list_pages')).pages[0],oldRef=initial.toolRefs[0];
 await rpc(browser,'pages.sync',{pages:[{...page,workspaceId:undefined,capabilities:['context.read']}]});
 assert.equal('toolRefs' in data(await call('luban_list_pages')).pages[0],false);
 assert.equal(data(await call('luban_get_tool',{toolRef:oldRef})).error.code,'TOOL_NOT_GRANTED');
 await rpc(browser,'pages.sync',{pages:[{...page,workspaceId:crypto.randomUUID()}]});
 assert.notEqual(data(await call('luban_list_pages')).pages[0].toolRefs[0],oldRef);
 assert.equal((await call('luban_get_tool',{toolRef:oldRef})).isError,true);
}));
test('MCP trial rejection, new approval, completion and duplicate keys preserve one confirmed task',()=>fixture(async({browser,call,client,reconnect})=>{
 const page=await grant(browser),toolRef=data(await call('luban_list_pages')).pages[0].toolRefs[0];
 const args={toolRef,pageRef:page.pageRef,requestKey:'reject-trial',draftRevision:1};
 const first=data(await call('luban_request_trial',args));let command=(await rpc(browser,'tasks.pull')).data.commands[0];
 assert.equal(first.task.state,'queued');
 await rpc(browser,'tasks.finish',{taskId:command.taskId,epoch:command.epoch,revision:command.revision,state:'waitingUser',result:{approvalState:'pending'}});
 await rpc(browser,'tasks.deny',{taskId:command.taskId});
 assert.equal(data(await call('luban_get_task',{taskId:command.taskId})).result.approvalState,'rejected');
 const approvedArgs={...args,requestKey:'approve-trial'};
 const next=data(await call('luban_request_trial',approvedArgs));assert.notEqual(next.task.taskId,first.task.taskId);
 command=(await rpc(browser,'tasks.pull')).data.commands[0];
 await rpc(browser,'tasks.finish',{taskId:command.taskId,epoch:command.epoch,revision:command.revision,state:'waitingUser',result:{approvalState:'pending'}});
 await client.close();await reconnect();assert.equal(data(await call('luban_get_task',{taskId:command.taskId})).task.state,'waitingUser');
 const claimed=(await rpc(browser,'tasks.confirm',{taskId:command.taskId})).data.task,receiptId=crypto.randomUUID();
 await rpc(browser,'tasks.finish',{taskId:command.taskId,epoch:claimed.epoch,revision:claimed.revision,state:'completed',result:{receiptId}});
 const duplicate=data(await call('luban_request_trial',approvedArgs));assert.equal(duplicate.task.taskId,next.task.taskId);assert.equal(duplicate.result.receiptId,receiptId);
 assert.equal((await rpc(browser,'tasks.confirm',{taskId:command.taskId})).ok,false);assert.deepEqual((await rpc(browser,'tasks.pull')).data.commands,[]);
}));
test('explicit MCP cancellation, event cursors and client isolation/revocation use authenticated ownership',()=>fixture(async({browser,config,dir,call})=>{
 await grant(browser);const toolRef=data(await call('luban_list_pages')).pages[0].toolRefs[0];
 const created=data(await call('luban_submit_draft',{toolRef,requestKey:'cancel-queued',expectedDraftRevision:0,code:'console.log(1)',grants:[],explanation:''}));
 assert.equal(data(await call('luban_cancel_task',{taskId:created.task.taskId})).task.state,'cancelled');
 const events=data(await call('luban_get_task',{taskId:created.task.taskId,afterSeq:0})).events;assert.ok(events.length);assert.deepEqual(data(await call('luban_get_task',{taskId:created.task.taskId,afterSeq:events.at(-1).seq})).events,[]);
 const otherConfig=join(dir,'second.json'),code=(await rpc(browser,'clients.enroll',{name:'Second SDK'})).data.enrollmentCode;await enrollMcpClient(otherConfig,code,{stateDir:dir});
 const other=new Client({name:'second-sdk',version:'1'});
 try{
  await other.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./fixtures/mcp-entry.mjs',import.meta.url)),otherConfig,dir],stderr:'pipe'}));
  for(const name of ['luban_get_task','luban_cancel_task'])assert.equal(data(await other.callTool({name,arguments:{taskId:created.task.taskId}})).error.code,'TASK_MISSING');
 }finally{await other.close();}
 await rpc(browser,'clients.revoke',{clientId:readMcpConfig(config).clientId});assert.equal(data(await call('luban_list_pages')).error.code,'CLIENT_AUTH_REQUIRED');
}));
