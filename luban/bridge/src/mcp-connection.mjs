import {readFileSync,lstatSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {z} from 'zod';
import {openClient} from './local-daemon.mjs';
import {FrameDecoder,encodeFrame} from './native-framing.mjs';

const configSchema=z.object({schemaVersion:z.literal(1),clientId:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const failure=code=>Object.assign(new Error(code),{code});
export function readMcpConfig(file){
  try{
    const stat=lstatSync(file);
    if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>4096)throw failure('MCP_CONFIG_UNSAFE');
    const config=configSchema.parse(JSON.parse(readFileSync(file,'utf8')));
    return {clientId:config.clientId,token:config.token};
  }catch(error){throw failure(error.code==='ENOENT'?'MCP_CONFIG_MISSING':error.code==='MCP_CONFIG_UNSAFE'?error.code:'MCP_CONFIG_INVALID');}
}
export class McpConnection{
  constructor(file,{stateDir=join(homedir(),'Library/Application Support/Luban/bridge')}={}){
    this.file=resolve(file);this.stateDir=stateDir;this.pending=new Map();this.closed=false;
  }
  async connect(){
    if(this.closed)throw failure('MCP_CLOSED');
    if(this.socket&&!this.socket.destroyed)return;
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{
      const credentials=readMcpConfig(this.file);
      let opened;
      try{opened=await openClient(this.stateDir,{credentials,cancelOnDisconnect:true});}
      catch{throw failure('BRIDGE_UNAVAILABLE');}
      if(this.closed){opened.socket.destroy();throw failure('MCP_CLOSED');}
      const socket=opened.socket;this.socket=socket;const decoder=new FrameDecoder();
      socket.on('data',chunk=>{
        try{for(const reply of decoder.push(chunk)){
          const request=this.pending.get(reply.requestId);if(!request||request.socket!==socket)continue;
          clearTimeout(request.timer);this.pending.delete(reply.requestId);
          if(reply.ok)request.resolve(reply.data);else request.reject(failure(reply.error?.code??'BRIDGE_REQUEST_FAILED'));
        }}catch{socket.destroy();}
      });
      socket.once('close',()=>{
        for(const [id,pending] of this.pending){if(pending.socket!==socket)continue;clearTimeout(pending.timer);pending.reject(failure('BRIDGE_DISCONNECTED'));this.pending.delete(id);}
      });
    })();
    try{await this.connecting;}finally{this.connecting=null;}
  }
  async request(method,params={}){
    await this.connect();const socket=this.socket,requestId=crypto.randomUUID();
    // A lost response never replays this request. The business requestKey and
    // durable task ID let the caller explicitly query or retry safely.
    return new Promise((resolveReply,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(requestId);reject(failure('BRIDGE_TIMEOUT'));socket.destroy();},10000);
      this.pending.set(requestId,{resolve:resolveReply,reject,timer,socket});
      try{socket.write(encodeFrame({protocolVersion:1,requestId,method,params}));}
      catch{clearTimeout(timer);this.pending.delete(requestId);reject(failure('BRIDGE_REQUEST_FAILED'));}
    });
  }
  close(){this.closed=true;this.socket?.destroy();}
}
