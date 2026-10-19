import {existsSync,mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {AGENT_CONFIG} from './agent-process.mjs';
export const CODEX_BIN='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const cache=new Map();
export function protocolSupported(thread,turn){return ['cwd','sandbox','approvalPolicy','ephemeral','config','developerInstructions'].every(k=>k in (thread.properties??{}))&&['threadId','input','outputSchema'].every(k=>k in (turn.properties??{}))&&JSON.stringify(thread.definitions?.SandboxMode??{}).includes('read-only');}
export function inspectCodex(bin=CODEX_BIN,{run=spawnSync,cacheResult=true}={}){
 const installed=existsSync(bin);const empty={installed,compatible:false,restrictionsApplied:false,version:null,executor:'codex',historyMode:'latest-baseline-new-thread'};if(!installed)return empty;
 const stat=statSync(bin),key=bin+':'+stat.mtimeMs+':'+stat.size;if(cacheResult&&cache.has(key))return cache.get(key);
 const version=run(bin,['--version'],{encoding:'utf8',timeout:3000,maxBuffer:4096});const match=/^codex(?:-cli)? (\d+\.\d+\.\d+(?:[-+][\w.\-]+)?)$/.exec(version.stdout?.trim()??'');
 const status={...empty,version:match?.[1]??null};if(version.status!==0||!match)return status;
 const args=Object.entries(AGENT_CONFIG).flatMap(([k,v])=>['-c',k+'='+JSON.stringify(v)]);
 const flags=run(bin,[...args,'features','list'],{encoding:'utf8',timeout:5000,maxBuffer:50000});
 status.restrictionsApplied=flags.status===0&&Object.entries(AGENT_CONFIG).filter(([k])=>k.startsWith('features.')).every(([k,v])=>flags.stdout?.split('\n').find(l=>l.split(/\s+/)[0]===k.slice(9))?.trim().split(/\s+/).at(-1)===String(v));
 if(status.restrictionsApplied){const dir=mkdtempSync(join(tmpdir(),'luban-codex-protocol-'));try{const schema=run(bin,['app-server','generate-json-schema','--out',dir],{encoding:'utf8',timeout:10000,maxBuffer:4096});status.compatible=schema.status===0&&protocolSupported(JSON.parse(readFileSync(join(dir,'v2/ThreadStartParams.json'),'utf8')),JSON.parse(readFileSync(join(dir,'v2/TurnStartParams.json'),'utf8')));}catch{/* incompatible protocols fail closed */}finally{rmSync(dir,{recursive:true,force:true});}}
 if(cacheResult&&status.compatible)cache.set(key,status);return status;
}
