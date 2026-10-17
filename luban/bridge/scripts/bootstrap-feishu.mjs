// Opt-in, receive-only setup. Do not run alongside another listener of this app.
import * as Lark from '@larksuiteoapi/node-sdk';
import {readFileSync,lstatSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';import {homedir} from 'node:os';import {join} from 'node:path';
import {loadFeishuConfig} from '../src/feishu-config.mjs';import {feishuBootstrapBinding} from '../src/feishu-bootstrap.mjs';
const source=process.argv[2];if(process.argv.length!==3)throw Error('Usage: runtime/node bootstrap-feishu.mjs /absolute/private/s0/feishu.json');
const target=join(homedir(),'Library/Application Support/Luban/bridge/feishu.json');if(existsSync(target))throw Error('CONFIG_ALREADY_EXISTS; inspect it instead of overwriting');
const stat=lstatSync(source);if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.size>4096)throw Error('CONFIG_UNSAFE');
const original=JSON.parse(readFileSync(source,'utf8'));if(!original.credentialRef||original.appSecret||original.credentialRef.account!==original.appId)throw Error('KEYCHAIN_REFERENCE_REQUIRED');
const config=loadFeishuConfig(source,{requireKeychain:true});const challenge='LUBAN_V3_SETUP_'+randomBytes(8).toString('hex');const expiresAt=Date.now()+5*60000;
const logger={trace(){},debug(){},info(){},warn(){},error(){}};
const ws=new Lark.WSClient({appId:config.appId,appSecret:config.appSecret,domain:Lark.Domain.Feishu,logger});let claimed=false;
function finish(code){clearTimeout(timer);ws.close({force:true});process.exit(code);}
const timer=setTimeout(()=>{console.log(JSON.stringify({status:'expired',configurationWritten:false,messageSent:false}));finish(1);},5*60000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>finish(1));
try{
 await ws.start({eventDispatcher:new Lark.EventDispatcher({}).register({'im.message.receive_v1':event=>{
  if(claimed)return;const binding=feishuBootstrapBinding(event,config,challenge,expiresAt);if(!binding)return;claimed=true;
  try{mkdirSync(join(homedir(),'Library/Application Support/Luban/bridge'),{recursive:true,mode:0o700});writeFileSync(target,JSON.stringify(binding)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({status:'configured',tenantKeyDiscovered:true,keychainReferenceReused:true,secretCopied:false,messageSent:false,listenerStopped:true}));finish(0);}
  catch{console.error('FEISHU_SETUP_WRITE_FAILED (no overwrite)');finish(1);}
 }})});
 console.log(JSON.stringify({status:'receive-only',sendExactly:challenge,expiresAt,onlyExistingBoundUser:true,messageSent:false}));
}catch{console.error('FEISHU_SETUP_LISTEN_FAILED (details suppressed)');finish(1);}
