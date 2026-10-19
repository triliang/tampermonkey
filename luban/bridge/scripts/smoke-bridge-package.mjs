import {mkdtempSync,cpSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {spawn,spawnSync} from 'node:child_process';
import {encodeFrame,FrameDecoder} from '../src/native-framing.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const dir=mkdtempSync('/private/tmp/luban-package-');const root=join(dir,'package with spaces');const state=join(dir,'state');const registrationPath=join(dir,'registration.json');const origin=`chrome-extension://${'a'.repeat(32)}/`;let child;
try{
 cpSync(resolve('dist/luban-bridge-macos-arm64'),root,{recursive:true});
 writeFileSync(registrationPath,JSON.stringify({name:'com.luban.bridge',path:join(root,'native-host'),allowed_origins:[origin]}),{mode:0o600});
 const source=`import {runHost} from ${JSON.stringify(pathToFileURL(join(root,'src/bridge-host.mjs')).href)};await runHost(${JSON.stringify({root,registrationPath,dir:state,origin})});`;
 child=spawn(join(root,'runtime/node'),['--input-type=module','-e',source],{env:{PATH:'/nonexistent'},stdio:['pipe','pipe','pipe']});
 const decoder=new FrameDecoder();const waiting=new Map();let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});child.stdout.on('data',chunk=>{for(const reply of decoder.push(chunk)){const waiter=waiting.get(reply.requestId);if(waiter){waiting.delete(reply.requestId);waiter(reply);}}});
 const call=(method,params={})=>new Promise((resolveReply,reject)=>{const requestId=crypto.randomUUID();const timer=setTimeout(()=>{waiting.delete(requestId);reject(Error('PACKAGE_SMOKE_TIMEOUT'));},10000);waiting.set(requestId,reply=>{clearTimeout(timer);resolveReply(reply);});child.stdin.write(encodeFrame({protocolVersion:1,requestId,method,params}));});
 const health=await call('health.get');if(!health.ok||health.data.service!=='luban-bridge'||health.data.node!=='v24.14.1')throw Error('PACKAGE_HEALTH_FAILED');
 if(!(await call('profile.pair')).ok)throw Error('PACKAGE_PAIRING_FAILED');
 const harnessStatus=await call('harness.status');if(!harnessStatus.ok||!harnessStatus.data.available)throw Error('PACKAGE_HARNESS_UNAVAILABLE');
 const harnessRuntime=pathToFileURL(join(root,'harness/dist/runtime.js')).href;const codexAdapter=pathToFileURL(join(root,'harness/dist/codex-model.js')).href;const fakeModel=pathToFileURL(join(root,'harness/node_modules/@langchain/core/utils/testing.js')).href;
 const check=spawnSync(join(root,'runtime/node'),['--input-type=module','-e',`const {createRuntime}=await import(${JSON.stringify(harnessRuntime)});const {FakeStreamingChatModel}=await import(${JSON.stringify(fakeModel)});const r=createRuntime({checkpointFile:':memory:',model:new FakeStreamingChatModel({responses:[]}),dispatch:async()=>({})});r.close();const {codexModules}=await import(${JSON.stringify(codexAdapter)});const cm=await codexModules();if(typeof cm.process.AgentProcess!=='function')throw Error('CODEX_ADAPTER_UNAVAILABLE');`],{env:{PATH:'/nonexistent',LANGSMITH_TRACING:'false'},timeout:10000,encoding:'utf8'});if(check.status!==0)throw Error('PACKAGE_HARNESS_IMPORT_FAILED');
 const pages=await call('pages.list');if(!pages.ok||pages.data.pages.length)throw Error('PACKAGE_PAGE_BOUNDARY_FAILED');
 if((await call('context.read')).error?.code!=='PAGE_NOT_GRANTED')throw Error('PACKAGE_CONTEXT_BOUNDARY_FAILED');
 // Discovery is deliberately credential-free and lazy: no production Bridge
 // connection is opened by initialize/listTools. Business calls require pairing.
 const mcp=new Client({name:'package-smoke',version:'1'});
 try{
  await mcp.connect(new StdioClientTransport({command:join(root,'luban-mcp'),args:['--connection-config',join(dir,'not-enrolled.json')],env:{PATH:'/nonexistent'},stderr:'pipe'}));
  const tools=await mcp.listTools();if(tools.tools.length!==7)throw Error('PACKAGE_MCP_DISCOVERY_FAILED');
 }finally{await mcp.close();}
 if(!(await call('profile.revoke')).ok)throw Error('PACKAGE_REVOCATION_FAILED');
 child.stdin.end();await new Promise((resolveExit,reject)=>{child.on('exit',code=>code===0?resolveExit():reject(Error('PACKAGE_HOST_EXIT_FAILED')));});
 if(stderr)throw Error('PACKAGE_UNEXPECTED_STDERR');
 console.log(JSON.stringify({passed:true,node:health.data.node,relocated:true,globalNodeRequired:false,ipc:true,pairing:true,noPageAccess:true,revocation:true,mcpStdioTools:7,harnessRuntime:true,realChromeRegistration:false}));
}finally{
 child?.kill();const lock=join(state,'daemon.json');if(existsSync(lock)){const metadata=JSON.parse(readFileSync(lock,'utf8'));try{process.kill(metadata.pid,'SIGTERM');}catch{}}
 // Give the dedicated test daemon time to release its own resources.
 await new Promise(resolveWait=>setTimeout(resolveWait,100));rmSync(dir,{recursive:true,force:true});
}
