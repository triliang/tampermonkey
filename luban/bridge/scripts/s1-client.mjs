// Local S1 acceptance client. It does not install an MCP server or approve tasks.
import {readFileSync,writeFileSync,lstatSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';import {join,resolve,dirname} from 'node:path';
import {openClient} from '../src/local-daemon.mjs';
import {encodeFrame,FrameDecoder} from '../src/native-framing.mjs';

const [action,file,arg]=process.argv.slice(2);
let socket;
try{
 if(!['pair','pages','submit','get','cancel','events'].includes(action)||!file)throw Error('Usage: s1-client.mjs pair|pages|submit|get|cancel|events <private-credentials-file> [request-json-file|task-id]');
 const credentialPath=resolve(file),dir=join(homedir(),'Library/Application Support/Luban/bridge');
 if(action==='pair'){
  // Read the one-time code through stdin, never command arguments or logs.
  const code=readFileSync(0,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(code))throw Error('INVALID_ENROLLMENT_CODE');
  mkdirSync(dirname(credentialPath),{recursive:true,mode:0o700});
  // Reserve the credential file before consuming the enrollment code.
  writeFileSync(credentialPath,'',{flag:'wx',mode:0o600});
  const opened=await openClient(dir,{enrollmentCode:code});socket=opened.socket;
  writeFileSync(credentialPath,JSON.stringify(opened.credentials),{mode:0o600});
  console.log(JSON.stringify({paired:true,credentialFile:credentialPath}));
 }else{
  const stat=lstatSync(credentialPath);if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('CREDENTIAL_FILE_UNSAFE');
  const opened=await openClient(dir,{credentials:JSON.parse(readFileSync(credentialPath,'utf8'))});socket=opened.socket;
  let params={};if(action==='submit'){if(!arg)throw Error('REQUEST_FILE_REQUIRED');params=JSON.parse(readFileSync(resolve(arg),'utf8'));}
  else if(action!=='pages'){if(!/^[a-f0-9-]{36}$/i.test(arg??''))throw Error('TASK_ID_REQUIRED');params={taskId:arg};}
  const method=action==='pages'?'pages.list':'tasks.'+action,requestId=crypto.randomUUID(),decoder=new FrameDecoder();
  const reply=await new Promise((resolveReply,reject)=>{
   const timer=setTimeout(()=>reject(Error('CLIENT_TIMEOUT')),10000);
   socket.once('close',()=>{clearTimeout(timer);reject(Error('CLIENT_DISCONNECTED'));});
   socket.on('data',chunk=>{try{for(const reply of decoder.push(chunk))if(reply.requestId===requestId){clearTimeout(timer);resolveReply(reply);}}catch(error){clearTimeout(timer);reject(error);}});
   socket.write(encodeFrame({protocolVersion:1,requestId,method,params}));
  });
  console.log(JSON.stringify(reply,null,2));if(!reply.ok)process.exitCode=1;
 }
}catch(error){console.error(error?.name==='SyntaxError'?'INVALID_JSON':error?.code??error?.message??'CLIENT_FAILED');process.exitCode=1;}
finally{socket?.destroy();}
