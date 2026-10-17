// Receive-only, five-minute, nonce-bound discovery. Does not modify the Feishu config.
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {loadFeishuConfig} from '../src/feishu-config.mjs';
import * as Lark from '@larksuiteoapi/node-sdk';
import {pairingCandidate} from '../src/feishu-pairing.mjs';
const file=process.argv[2];if(!file)throw Error('Provide private local Feishu config path');
const config=loadFeishuConfig(file,{allowUnbound:true});
const challenge='LUBAN_BIND_'+randomBytes(16).toString('hex');
const expiresAt=Date.now()+300000;
let finished=false;
const logger={trace(){},debug(){},info(){},warn(){},error(){}};
const ws=new Lark.WSClient({appId:config.appId,appSecret:config.appSecret,domain:Lark.Domain.Feishu,logger});
function finish(code){if(finished)return;finished=true;clearTimeout(timer);ws.close({force:true});process.exitCode=code;}
const timer=setTimeout(()=>{console.log(JSON.stringify({status:'pairing-expired',configChanged:false}));finish(1);},300000);
process.on('SIGINT',()=>finish(1));process.on('SIGTERM',()=>finish(1));
try {
 await ws.start({eventDispatcher:new Lark.EventDispatcher({}).register({'im.message.receive_v1':async event=>{
   if(finished)return;
   const candidate=pairingCandidate(event,challenge,expiresAt);
   if(!candidate)return;
   finished=true;clearTimeout(timer);
   try {writeFileSync(join(dirname(file),'feishu-pairing-candidate.json'),JSON.stringify({appId:config.appId,...candidate},null,2)+'\n',{mode:0o600});console.log(JSON.stringify({status:'candidate-found',senderOpenId:candidate.senderOpenId,messageId:candidate.messageId,configChanged:false}));} catch {console.error('PAIRING_CANDIDATE_WRITE_FAILED');process.exitCode=1;}
   finally {ws.close({force:true});}
 }})});
 if(!finished)console.log(JSON.stringify({status:'listener-started',challenge,expiresAt,configChanged:false}));
} catch {console.error('FEISHU_PAIRING_START_FAILED (check config, permissions and network; details suppressed)');finish(1);}
