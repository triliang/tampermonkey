import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {startDaemon,openDaemon,openClient} from '../src/local-daemon.mjs';import {encodeFrame,FrameDecoder} from '../src/native-framing.mjs';
function call(socket,method,params={}){return new Promise((resolve,reject)=>{const decoder=new FrameDecoder();const requestId=crypto.randomUUID();const timer=setTimeout(()=>{socket.off('data',onData);reject(Error('TEST_TIMEOUT'));},2000);const onData=chunk=>{for(const reply of decoder.push(chunk)){if(reply.requestId===requestId){clearTimeout(timer);socket.off('data',onData);resolve(reply);}}};socket.on('data',onData);socket.write(encodeFrame({protocolVersion:1,requestId,method,params}));});}
test('overlapping native IPC reconnect retires old owner and late socket close preserves new grants',async()=>{
 const dir=mkdtempSync('/private/tmp/luban-overlap-'),origin=`chrome-extension://${'a'.repeat(32)}/`;
 const daemon=startDaemon({dir,allowedOrigins:[origin]});let old,current;
 try{
  await daemon.ready;old=await openDaemon(dir,origin);const credentials=(await call(old,'profile.pair')).data;
  current=await openDaemon(dir,origin);assert.equal((await call(current,'profile.authenticate',credentials)).ok,true);
  assert.equal((await call(old,'pages.list')).error.code,'NATIVE_SESSION_REPLACED');
  const page={pageRef:crypto.randomUUID(),browserSession:crypto.randomUUID(),documentId:'successor-document',navigationEpoch:2,title:'Successor page',url:'https://example.com',capabilities:['context.read']};
  assert.equal((await call(current,'pages.sync',{pages:[page]})).ok,true);
  old.destroy();await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await call(current,'pages.list')).data.pages[0].pageRef,page.pageRef);
  assert.equal((await call(current,'health.get')).ok,true);
 }finally{old?.destroy();current?.destroy();await daemon.close();rmSync(dir,{recursive:true,force:true});}
});
test('single local daemon separates simultaneous profile sessions and persists revocation',async()=>{
 const dir=mkdtempSync('/private/tmp/luban-ipc-');const origin=`chrome-extension://${'a'.repeat(32)}/`;const daemon=startDaemon({dir,allowedOrigins:[origin]});let a,b;try{await daemon.ready;assert.throws(()=>startDaemon({dir,allowedOrigins:[origin]}),/ALREADY_RUNNING/);a=await openDaemon(dir,origin);b=await openDaemon(dir,origin);const first=(await call(a,'profile.pair')).data,second=(await call(b,'profile.pair')).data;assert.notEqual(first.profileId,second.profileId);await call(a,'profile.revoke');assert.equal((await call(b,'pages.list')).ok,true);const third=await openDaemon(dir,origin);try{assert.equal((await call(third,'profile.authenticate',first)).error.code,'PAIRING_REQUIRED');}finally{third.destroy();}}finally{a?.destroy();b?.destroy();await daemon.close();rmSync(dir,{recursive:true,force:true});}
});
test('real IPC external client requires enrollment, routes to owning profile, cannot approve, and revocation fences execution',async()=>{
 const dir=mkdtempSync('/private/tmp/luban-client-'),origin=`chrome-extension://${'a'.repeat(32)}/`;
 const daemon=startDaemon({dir,allowedOrigins:[origin]});const sockets=[];
 try{
  await daemon.ready;const browser=await openDaemon(dir,origin),other=await openDaemon(dir,origin);sockets.push(browser,other);
  await call(browser,'profile.pair');await call(other,'profile.pair');
  const enrollment=(await call(browser,'clients.enroll',{name:'Disposable IPC client'})).data;
  const client=await openClient(dir,{enrollmentCode:enrollment.enrollmentCode});sockets.push(client.socket);
  await assert.rejects(openClient(dir,{enrollmentCode:enrollment.enrollmentCode}));
  const page={pageRef:crypto.randomUUID(),browserSession:crypto.randomUUID(),documentId:'ipc-document',navigationEpoch:1,title:'Test',url:'https://example.com',capabilities:['context.read']};
  assert.equal((await call(browser,'pages.sync',{pages:[page]})).ok,true);
  assert.equal((await call(client.socket,'pages.list')).data.pages[0].pageRef,page.pageRef);
  const input={requestKey:'ipc-one',command:'readContext',pageRef:page.pageRef};
  const first=await call(client.socket,'tasks.submit',input),again=await call(client.socket,'tasks.submit',input);
  assert.equal(first.data.task.id,again.data.task.id);
  assert.deepEqual((await call(other,'tasks.pull')).data.commands,[]);
  const command=(await call(browser,'tasks.pull')).data.commands[0];assert.equal(command.taskId,first.data.task.id);
  assert.equal((await call(client.socket,'tasks.confirm',{taskId:command.taskId})).ok,false);
  assert.equal((await call(browser,'tasks.check',{taskId:command.taskId,epoch:command.epoch,revision:command.revision})).ok,true);
  await call(browser,'clients.revoke',{clientId:client.credentials.clientId});
  assert.equal((await call(client.socket,'pages.list')).error.code,'CLIENT_AUTH_REQUIRED');
  assert.equal((await call(browser,'tasks.check',{taskId:command.taskId,epoch:command.epoch,revision:command.revision})).error.code,'CLIENT_AUTH_REQUIRED');
 }finally{for(const socket of sockets)socket.destroy();await daemon.close();rmSync(dir,{recursive:true,force:true});}
});
test('reconnect and daemon restart preserve credentials but clear page grants; revoked credentials stay invalid',async()=>{
 const dir=mkdtempSync('/private/tmp/luban-restart-');const origin=`chrome-extension://${'a'.repeat(32)}/`;let daemon=startDaemon({dir,allowedOrigins:[origin]});let socket;
 try{await daemon.ready;socket=await openDaemon(dir,origin);const credentials=(await call(socket,'profile.pair')).data;const page={pageRef:crypto.randomUUID(),browserSession:crypto.randomUUID(),documentId:'doc-test',navigationEpoch:1,title:'Disposable test',url:'https://example.com',capabilities:['context.read']};assert.equal((await call(socket,'pages.sync',{pages:[page]})).ok,true);socket.destroy();await daemon.close();
  daemon=startDaemon({dir,allowedOrigins:[origin]});await daemon.ready;socket=await openDaemon(dir,origin);const authenticated=await call(socket,'profile.authenticate',credentials);assert.equal(authenticated.data.profileId,credentials.profileId);assert.deepEqual((await call(socket,'pages.list')).data.pages,[]);await call(socket,'profile.revoke');socket.destroy();await daemon.close();
  daemon=startDaemon({dir,allowedOrigins:[origin]});await daemon.ready;socket=await openDaemon(dir,origin);assert.equal((await call(socket,'profile.authenticate',credentials)).error.code,'PAIRING_REQUIRED');await assert.rejects(openDaemon(dir,`chrome-extension://${'b'.repeat(32)}/`),/DISCONNECTED/);
 }finally{socket?.destroy();await daemon.close();rmSync(dir,{recursive:true,force:true});}
});
