import {HarnessService} from './harness-service.mjs';
import {ClientStore} from './store/client-store.mjs';import {TaskCoordinator} from './task-coordinator.mjs';import {ClientGateway} from './client-gateway.mjs';
import {TaskStore} from './store/task-store.mjs';import {DiagnosticStore} from './store/diagnostic-store.mjs';
import {createServer,createConnection} from 'node:net';
import {readFileSync,writeFileSync,existsSync,unlinkSync,chmodSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {FeishuChannel} from './feishu-channel.mjs';
import {AgentService} from './agent-service.mjs';
import {FrameDecoder,encodeFrame} from './native-framing.mjs';
import {ProfileStore} from './store/profile-store.mjs';import {NativeGateway} from './native-gateway.mjs';
export function daemonPaths(dir){return {socket:join(dir,'bridge.sock'),lock:join(dir,'daemon.json')};}
function live(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
export function startDaemon({dir,allowedOrigins,idleMs=60000}){
 const paths=daemonPaths(dir);const token=randomBytes(32).toString('hex');
 const startup=join(dir,'startup.json');
 // Serialize stale-owner cleanup as well as startup. A crashed startup fails
 // closed and needs explicit repair; it never steals a possibly live lock.
 try{writeFileSync(startup,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});}catch{throw Error('DAEMON_STARTUP_IN_PROGRESS');}
 const releaseStartup=()=>{try{if(JSON.parse(readFileSync(startup,'utf8')).token===token)unlinkSync(startup);}catch{/* preserve another owner */}};
 try{
 if(existsSync(paths.lock)){
  const stat=lstatSync(paths.lock);if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('DAEMON_LOCK_UNSAFE');
  const old=JSON.parse(readFileSync(paths.lock,'utf8'));if(!Number.isSafeInteger(old.pid)||old.pid<1||live(old.pid))throw Error('DAEMON_ALREADY_RUNNING');
  if(existsSync(paths.socket)){const socket=lstatSync(paths.socket);if(!socket.isSocket()||socket.uid!==process.getuid())throw Error('DAEMON_SOCKET_UNSAFE');unlinkSync(paths.socket);}
  unlinkSync(paths.lock);
 }
 writeFileSync(paths.lock,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});
 }catch(e){releaseStartup();throw e;}
 let profiles,tasks,diagnostics;
 try{profiles=new ProfileStore(join(dir,'profiles.sqlite'));profiles.resetPages();chmodSync(join(dir,'profiles.sqlite'),0o600);tasks=new TaskStore(join(dir,'tasks.sqlite'));diagnostics=new DiagnosticStore(join(dir,'diagnostics.sqlite'));for(const file of ['tasks.sqlite','diagnostics.sqlite'])chmodSync(join(dir,file),0o600);}catch(e){profiles?.close();tasks?.close();diagnostics?.close();releaseStartup();try{if(JSON.parse(readFileSync(paths.lock,'utf8')).token===token)unlinkSync(paths.lock);}catch{/* preserve another owner */}throw e;}
 const clientsStore=new ClientStore(profiles);const coordinator=new TaskCoordinator(tasks,profiles);
 const agent=new AgentService(tasks,dir);
 const harness=new HarnessService(profiles,dir);
 const services={harness,agent,profiles,clients:clientsStore,coordinator,tasks,diagnostics,maintain:()=>({tasks:tasks.maintain(),diagnostics:diagnostics.maintain(),harness:harness.maintain()})};
 services.channel=new FeishuChannel(services,dir);
 const maintenanceTimer=setInterval(()=>{try{services.maintain();}catch{/* read-only health/export remains available for recovery */}},5*60000);maintenanceTimer.unref();
 const clients=new Set();let timer,closed=false;
 const cleanup=async()=>{if(closed)return;closed=true;clearTimeout(timer);clearInterval(maintenanceTimer);releaseStartup();for(const socket of clients)socket.destroy();if(services.channel.state==='connected')await services.channel.disconnect({profileId:services.channel.profileId});await agent.close();harness.close();profiles.close();tasks.close();diagnostics.close();try{const owner=JSON.parse(readFileSync(paths.lock,'utf8'));if(owner.token===token){unlinkSync(paths.lock);if(existsSync(paths.socket))unlinkSync(paths.socket);}}catch{/* preserve a different owner */}};
 const server=createServer(socket=>{
  clients.add(socket);clearTimeout(timer);const decoder=new FrameDecoder();let gateway;
  const handshakeTimer=setTimeout(()=>socket.destroy(),5000);
  socket.on('data',chunk=>{try{for(const packet of decoder.push(chunk)){
   if(!gateway){if(typeof packet?.token!=='string'||!/^[a-f0-9]{64}$/.test(packet.token)||!timingSafeEqual(Buffer.from(packet.token),Buffer.from(token)))throw Error('IPC_AUTH_FAILED');let credentials;
    if(packet.type==='native.open'){if(!allowedOrigins.includes(packet.origin))throw Error('IPC_AUTH_FAILED');gateway=new NativeGateway(profiles,packet.origin.slice(19,-1),services);}
    else if(packet.type==='client.open'){credentials=packet.enrollmentCode?clientsStore.exchange(packet.enrollmentCode):packet.credentials;clientsStore.authenticate(credentials);gateway=new ClientGateway(credentials,services,{cancelOnDisconnect:packet.cancelOnDisconnect===true});}
    else throw Error('IPC_AUTH_FAILED');
    clearTimeout(handshakeTimer);try{diagnostics.add({component:'ipc',code:'CONNECTED',level:'info'});}catch{}socket.write(encodeFrame({type:packet.type==='native.open'?'native.ready':'client.ready',...(packet.enrollmentCode?{credentials}:{})}));}
   else void Promise.resolve(gateway.handle(packet)).then(reply=>{if(!socket.destroyed)socket.write(encodeFrame(reply));}).catch(()=>socket.destroy());
  }}catch{socket.destroy();}});
  socket.on('error',()=>{});socket.on('end',()=>{try{decoder.end();}catch{socket.destroy();}});
  socket.on('close',()=>{clearTimeout(handshakeTimer);if(!closed)gateway?.close();clients.delete(socket);scheduleIdle();});
 });
 function scheduleIdle(){clearTimeout(timer);if(!closed&&!clients.size)timer=setTimeout(()=>server.close(cleanup),idleMs);}
 server.on('error',cleanup);
 const ready=new Promise((resolveReady,reject)=>{server.once('error',reject);server.listen(paths.socket,()=>{chmodSync(paths.socket,0o600);releaseStartup();scheduleIdle();resolveReady();});});
 return {ready,close:()=>new Promise(resolveClose=>{clearTimeout(timer);for(const socket of clients)socket.destroy();server.close(()=>{void cleanup().then(resolveClose);});})};
}
function openEndpoint(dir,hello,readyType){
 const paths=daemonPaths(dir);return new Promise((resolveOpen,reject)=>{
  let metadata;try{const stat=lstatSync(paths.lock);if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('DAEMON_LOCK_UNSAFE');metadata=JSON.parse(readFileSync(paths.lock,'utf8'));}catch(e){reject(e);return;}
  const socket=createConnection(paths.socket);const decoder=new FrameDecoder();const timeout=setTimeout(()=>{socket.destroy();reject(Error('DAEMON_TIMEOUT'));},3000);
  const onError=e=>{clearTimeout(timeout);reject(e);};socket.once('error',onError);
  socket.once('connect',()=>socket.write(encodeFrame({...hello,token:metadata.token})));
  const onData=chunk=>{try{const frames=decoder.push(chunk);if(!frames.length)return;if(frames.length!==1||frames[0]?.type!==readyType)throw Error('IPC_HANDSHAKE_FAILED');socket.off('data',onData);clearTimeout(timeout);socket.off('error',onError);socket.on('error',()=>{});resolveOpen({socket,credentials:frames[0].credentials});}catch(e){socket.destroy();onError(e);}};
  socket.on('data',onData);socket.once('close',()=>{clearTimeout(timeout);reject(Error('DAEMON_DISCONNECTED'));});
 });
}
export async function openDaemon(dir,origin){return (await openEndpoint(dir,{type:'native.open',origin},'native.ready')).socket;}
export async function openClient(dir,auth){return openEndpoint(dir,{type:'client.open',...auth},'client.ready');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [dir,registrationPath]=process.argv.slice(2);
 try{const registration=JSON.parse(readFileSync(registrationPath,'utf8'));if(registration.name!=='com.luban.bridge'||!Array.isArray(registration.allowed_origins)||!registration.allowed_origins.every(x=>/^chrome-extension:\/\/[a-p]{32}\/$/.test(x)))throw Error('INVALID_REGISTRATION');const daemon=startDaemon({dir,allowedOrigins:registration.allowed_origins});await daemon.ready;for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void daemon.close();});}catch{process.stderr.write('LUBAN_DAEMON_START_FAILED\n');process.exitCode=1;}
}
