import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {AgentProcess} from '../src/agent-process.mjs';
test('agent app-server uses isolated stdio and restrictive flags, returns complete final text and closes process',async()=>{
 let argsSeen;const runner=new AgentProcess({bin:'/test-only/codex',cwd:'/private/tmp',spawnProcess:(_bin,args,options)=>{argsSeen=args;return spawn(process.execPath,[fileURLToPath(new URL('./fixtures/agent-server.mjs',import.meta.url))],options);},timeoutMs:2000});
 const progress=[];const output=await runner.run([{role:'user',content:'latest baseline'}],text=>progress.push(text));assert.equal(output,'{"code":"console.log(1)"}');assert.equal(progress.length,1);assert.ok(argsSeen.includes('features.shell_tool=false'));assert.ok(argsSeen.includes('mcp_servers={}'));assert.ok(!argsSeen.includes('--ignore-user-config'));
});
test('missing official binary fails with a sanitized start error',async()=>{
 const runner=new AgentProcess({bin:'/does-not-exist/luban-codex',cwd:'/private/tmp',timeoutMs:1000});await assert.rejects(runner.run([]),/AGENT_START_FAILED/);
});
