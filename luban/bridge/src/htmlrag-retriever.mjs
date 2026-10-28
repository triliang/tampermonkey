import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
const source=fileURLToPath(new URL('../.local/htmlrag-venv/bin/python',import.meta.url));
const packaged=fileURLToPath(new URL('../../../.local/htmlrag-venv/bin/python',import.meta.url));
export class HtmlRagRetriever{
 constructor({enabled=false,python=existsSync(source)?source:packaged,timeoutMs=2500,onStatus}={}){this.publish=()=>{try{onStatus?.({...this.status(),pid:process.pid,at:Date.now()});}catch{}};this.startedAt=performance.now();this.enabled=enabled;this.timeoutMs=timeoutMs;this.pending=new Map();this.state=enabled?'warming':'disabled';if(!enabled){this.publish();return;}if(!existsSync(python)){this.state='unavailable';this.publish();return;}this.publish();
 this.child=spawn(python,['-I','-u',fileURLToPath(new URL('./htmlrag/worker.py',import.meta.url))],{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',TMPDIR:process.env.TMPDIR??'/tmp',LANG:'en_US.UTF-8',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',LANGCHAIN_TRACING_V2:'false',LANGSMITH_TRACING:'false',TOKENIZERS_PARALLELISM:'false',OMP_NUM_THREADS:'1'}});
 this.startTimer=setTimeout(()=>this.fail('startup_timeout'),45000);this.startTimer.unref();
 this.reader=createInterface({input:this.child.stdout});this.reader.on('line',line=>{try{if(Buffer.byteLength(line)>48000)return this.fail('output_limit');const result=JSON.parse(line);if(result.ready){clearTimeout(this.startTimer);this.state='ready';this.startupMs=Math.round(performance.now()-this.startedAt);this.packageVersion=result.packageVersion;this.publish();return;}const entry=this.pending.get(result.id);if(!entry)return;clearTimeout(entry.timer);this.pending.delete(result.id);entry.resolve(result);}catch{this.fail('invalid_output');}});
 this.child.on('error',()=>this.fail('process_error'));this.child.on('exit',()=>this.fail('process_exit'));this.child.stdin.on('error',()=>this.fail('process_error'));
 }
 status(){return {requested:this.enabled?'htmlrag-bm25':'bm25',state:this.state,packageVersion:this.packageVersion??null,startupMs:this.startupMs??null};}
 fail(reason){if(this.state==='closed')return;clearTimeout(this.startTimer);this.state='unavailable';this.publish();for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.resolve({ok:false,reason});}this.pending.clear();this.child?.kill();}
 async rank(data,query,limit=8){const start=performance.now();const fallback=reason=>({requested:'htmlrag-bm25',engine:'bm25',reason,elapsedMs:Math.round(performance.now()-start)});if(!this.enabled)return null;if(this.state!=='ready')return fallback(this.state);if(data?.htmlFormat!=='bounded-dom-projection-v1'||typeof data.html!=='string')return fallback('snapshot_unavailable');if(!Array.isArray(data.blocks)||data.blocks.length>240||Buffer.byteLength(JSON.stringify(data))>120000)return fallback('input_limit');
 const id=randomUUID();const result=await new Promise(resolve=>{const timer=setTimeout(()=>{this.pending.delete(id);resolve({ok:false,reason:'timeout'});this.fail('timeout');},this.timeoutMs);this.pending.set(id,{resolve,timer});this.child.stdin.write(JSON.stringify({id,html:data.html,blocks:data.blocks,query,limit})+'\n');});
 const known=new Set(data.blocks.map(b=>b.id));if(!result.ok)return fallback(result.reason??'pruning_failed');if(!Array.isArray(result.ids)||result.ids.length>8||new Set(result.ids).size!==result.ids.length||result.ids.some(x=>!known.has(x))||typeof result.context!=='string'||result.context.length>4096||[...result.context.matchAll(/LUBAN_REF_(obs-[a-zA-Z0-9-]{1,100})/g)].some(m=>!result.ids.includes(m[1])))return fallback('invalid_references');
 return {requested:'htmlrag-bm25',engine:'htmlrag-bm25',packageVersion:this.packageVersion,ids:result.ids,context:result.context,blockCount:result.blockCount,elapsedMs:Math.round(performance.now()-start),pruneMs:result.elapsedMs,budgetUnit:'characters'};
 }
 close(){this.fail('closed');this.state='closed';this.publish();this.reader?.close();}
}
