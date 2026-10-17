// S0: observe a real permission request and deny it. Only target is a disposable marker.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,existsSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
const bin=process.env.LUBAN_CODEX_BIN;if(!bin)throw Error('Set LUBAN_CODEX_BIN');
const cwd=resolve('.local/codex-approval');mkdirSync(cwd,{recursive:true,mode:0o700});
const marker=join(cwd,'denied-'+randomUUID()+'.txt');
const child=spawn(bin,['app-server','--listen','stdio://','-c','mcp_servers={}'],{stdio:['pipe','pipe','pipe']});
let next=0,approvalCount=0,declined=0,completed;
const pending=new Map(),decisions=new Set();
child.stderr.on('data',()=>{});
child.on('error',e=>{for(const p of pending.values())p.reject(e);pending.clear();});
child.on('exit',()=>{for(const p of pending.values())p.reject(Error('APP_SERVER_EXIT'));pending.clear();});
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
 if(m.method&&m.id!==undefined){
  if(m.method==='item/commandExecution/requestApproval'||m.method==='item/fileChange/requestApproval'){
   approvalCount++;console.log(JSON.stringify({check:'approval',state:'waiting',method:m.method}));
   const timer=setTimeout(()=>{decisions.delete(timer);declined++;child.stdin.write(JSON.stringify({id:m.id,result:{decision:'decline'}})+'\n');console.log(JSON.stringify({check:'approval',state:'declined',method:m.method}));},1000);decisions.add(timer);
  }else child.stdin.write(JSON.stringify({id:m.id,error:{code:-32000,message:'S0 probe never grants additional permissions'}})+'\n');
 }else if(m.id!==undefined){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error('RPC_ERROR:'+m.error.code)):p.resolve(m.result);}}
 else if(m.method==='turn/completed')completed=m.params?.turn;
});
function rpc(method,params){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('RPC_TIMEOUT:'+method));},25000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
const deadline=setTimeout(()=>child.kill('SIGTERM'),90000);
try{
 await rpc('initialize',{clientInfo:{name:'luban_s0_approval_probe',version:'0.0.1'},capabilities:{experimentalApi:false}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
 const t=await rpc('thread/start',{cwd,sandbox:'read-only',approvalPolicy:'untrusted',approvalsReviewer:'user',ephemeral:true,config:{mcp_servers:{}},developerInstructions:'This is a disposable permission denial integration test. Use no subagents, other tools, network or alternate approaches. Attempt the one requested command once. If denied, stop immediately and report denied.'});
 const turn=await rpc('turn/start',{threadId:t.thread.id,input:[{type:'text',text:`Use the shell tool to run exactly /usr/bin/touch '${marker}'. This is a temporary test marker. Request approval if required. If permission is denied, do not retry, change permissions, or use another tool.`}]});
 const until=Date.now()+60000;
 while(Date.now()<until&&completed?.id!==turn.turn.id)await new Promise(r=>setTimeout(r,100));
 if(completed?.id!==turn.turn.id)throw Error('TURN_TIMEOUT');
 const created=existsSync(marker);
 console.log(JSON.stringify({check:'codex-approval-denial',approvalCount,declined,markerCreated:created,turnStatus:completed.status,passed:approvalCount>0&&declined===approvalCount&&!created}));
 if(!approvalCount||declined!==approvalCount||created)process.exitCode=1;
}finally{clearTimeout(deadline);for(const t of decisions)clearTimeout(t);lines.close();child.stdin.end();child.kill('SIGTERM');if(existsSync(marker))unlinkSync(marker);}
