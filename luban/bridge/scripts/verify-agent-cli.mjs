import {spawnSync} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {AgentService,CODEX_BIN} from '../src/agent-service.mjs';import {AGENT_CONFIG} from '../src/agent-process.mjs';
const dir=mkdtempSync('/private/tmp/luban-cli-check-');
try{
 const status=AgentService.prototype.status.call({bin:CODEX_BIN,dir});if(!status.compatible)throw Error('AGENT_VERSION_UNAVAILABLE');
 const args=Object.entries(AGENT_CONFIG).flatMap(([key,value])=>['-c',key+'='+JSON.stringify(value)]);
 const result=spawnSync(CODEX_BIN,[...args,'features','list'],{cwd:dir,encoding:'utf8',timeout:5000,maxBuffer:30000});if(result.status!==0)throw Error('AGENT_FLAGS_REJECTED');
 const checks=Object.entries(AGENT_CONFIG).filter(([key])=>key.startsWith('features.')).map(([key,value])=>{const name=key.slice(9),line=result.stdout.split('\n').find(line=>line.split(/\s+/)[0]===name);return {feature:name,expected:value,passed:line?.trim().split(/\s+/).at(-1)===String(value)};});
 if(checks.some(c=>!c.passed)){console.log(JSON.stringify({passed:false,checks}));throw Error('AGENT_RESTRICTIVE_FEATURE_NOT_APPLIED');}
 console.log(JSON.stringify({passed:true,...status,checks,modelTurnExecuted:false,loginRead:false,userConfigModified:false}));
}finally{rmSync(dir,{recursive:true,force:true});}
