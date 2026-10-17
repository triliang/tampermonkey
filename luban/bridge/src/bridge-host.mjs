import {readFileSync,mkdirSync,chmodSync,realpathSync} from 'node:fs';
import {homedir} from 'node:os';import {join,dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
import {FrameDecoder} from './native-framing.mjs';import {openDaemon} from './local-daemon.mjs';
export async function runHost({root,registrationPath,dir,origin}){
 const registration=JSON.parse(readFileSync(registrationPath,'utf8'));
 if(registration.name!=='com.luban.bridge'||realpathSync(registration.path)!==realpathSync(join(root,'native-host'))||!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin??'')||!registration.allowed_origins?.includes(origin))throw Error('ORIGIN_FORBIDDEN');
 mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 let socket;
 try{socket=await openDaemon(dir,origin);}catch{
  const child=spawn(process.execPath,[join(root,'src/local-daemon.mjs'),dir,registrationPath],{detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();
  for(let attempt=0;attempt<30&&!socket;attempt++){await new Promise(resolveWait=>setTimeout(resolveWait,100));try{socket=await openDaemon(dir,origin);}catch{/* bounded startup, no request replay */}}
 }
 if(!socket)throw Error('DAEMON_UNAVAILABLE');
 const inbound=new FrameDecoder(),outbound=new FrameDecoder();let failed=false;
 const fail=()=>{if(failed)return;failed=true;process.exitCode=1;process.stderr.write('LUBAN_NATIVE_CONNECTION_FAILED\n');process.stdin.destroy();socket.destroy();};
 process.stdin.on('data',chunk=>{if(failed)return;try{inbound.push(chunk);socket.write(chunk);}catch{fail();}});
 socket.on('data',chunk=>{if(failed)return;try{outbound.push(chunk);process.stdout.write(chunk);}catch{fail();}});
 process.stdin.on('end',()=>{try{inbound.end();socket.end();}catch{fail();}});
 socket.on('end',()=>{try{outbound.end();}catch{process.exitCode=1;}process.stdin.destroy();});socket.on('error',fail);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await runHost({root:resolve(dirname(fileURLToPath(import.meta.url)),'..'),registrationPath:join(homedir(),'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.luban.bridge.json'),dir:join(homedir(),'Library/Application Support/Luban/bridge'),origin:process.argv[2]});}
 catch{process.stderr.write('LUBAN_NATIVE_REGISTRATION_OR_CONNECTION_INVALID\n');process.exitCode=1;}
}
