import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {AgentProcess} from '../src/agent-process.mjs';
test('agent app-server uses isolated stdio and restrictive flags, returns complete final text and closes process',async()=>{
 let argsSeen;const runner=new AgentProcess({bin:'/test-only/codex',cwd:'/private/tmp',spawnProcess:(_bin,args,options)=>{argsSeen=args;return spawn(process.execPath,[fileURLToPath(new URL('./fixtures/agent-server.mjs',import.meta.url))],options);},timeoutMs:2000});
 const progress=[];const output=await runner.run([{role:'user',content:'latest baseline'}],text=>progress.push(text));assert.equal(output,'{"code":"console.log(1)"}');assert.equal(progress.length,1);assert.ok(argsSeen.includes('features.shell_tool=false'));assert.ok(argsSeen.includes('mcp_servers={}'));assert.ok(!argsSeen.includes('--ignore-user-config'));
});
test('missing official binary fails with a sanitized start error',async()=>{
 const runner=new AgentProcess({bin:'/does-not-exist/luban-codex',cwd:'/private/tmp',timeoutMs:1000});await assert.rejects(runner.run([]),/AGENT_START_FAILED/);
});
test('abort terminates the app-server without accepting a late response',async()=>{
 const abort=new AbortController();const runner=new AgentProcess({bin:'/test-only',cwd:'/private/tmp',spawnProcess:()=>spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['pipe','pipe','pipe']}),timeoutMs:2000});const result=runner.run([],()=>{},{signal:abort.signal});abort.abort();await assert.rejects(result,/CANCELLED/);});
const fixtureRunner=arg=>new AgentProcess({bin:'/test-only/codex',cwd:'/private/tmp',spawnProcess:(_bin,_args,options)=>spawn(process.execPath,[fileURLToPath(new URL('./fixtures/agent-server.mjs',import.meta.url)),arg],options),timeoutMs:2000});
test('transient read-only account discovery retries without replaying a model turn',async()=>{assert.equal(await fixtureRunner('--routing-retry').run([]),'{"code":"console.log(1)"}');});
test('missing login and server permission requests are rejected',async()=>{await assert.rejects(fixtureRunner('--no-account').run([]),/AGENT_LOGIN_REQUIRED/);await assert.rejects(fixtureRunner('--deny-tool').run([]),/AGENT_PERMISSION_REQUIRED/);});
test('completed message is authoritative instead of concatenated interim text',async()=>{assert.equal(await fixtureRunner('--final-message').run([]),'final authoritative message');});
test('model-backend mode authenticates on native turn without an unrelated account UI discovery RPC',async()=>{const runner=fixtureRunner('--no-account');assert.equal(await runner.run([],()=>{},{readAccount:false}),'{"code":"console.log(1)"}');});
