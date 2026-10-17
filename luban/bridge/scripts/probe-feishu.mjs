// Explicit five-minute probe. No credentials/body in logs; one reply at most.
import * as Lark from '@larksuiteoapi/node-sdk';
import {inspectProbeMessage} from '../src/feishu-probe-match.mjs';
import {loadFeishuConfig} from '../src/feishu-config.mjs';
const path=process.argv[2];if(!path)throw Error('Provide private local Feishu config path');
const config=loadFeishuConfig(path);
const logger={trace(){},debug(){},info(){},warn(){},error(){}};
const base={appId:config.appId,appSecret:config.appSecret,domain:Lark.Domain.Feishu,logger};
const client=new Lark.Client(base),ws=new Lark.WSClient(base);
const negativeMode=process.argv.includes('--negative-check');
let finished=false,claimed=false,received=0;
function finish(code){if(finished)return;finished=true;clearTimeout(timer);ws.close({force:true});process.exitCode=code;}
const timer=setTimeout(()=>{console.log(JSON.stringify({check:'feishu',status:'timeout-no-confirmed-message',receivedEvents:received,replyAttempted:claimed}));finish(1);},300000);
process.on('SIGINT',()=>finish(1));process.on('SIGTERM',()=>finish(1));
try{
 await ws.start({eventDispatcher:new Lark.EventDispatcher({}).register({'im.message.receive_v1':async event=>{
   if(finished||claimed)return;
   received++;
   const {diagnostics,matches}=inspectProbeMessage(event,config.senderOpenId);
   console.log(JSON.stringify({check:'feishu-receive',event:received,...diagnostics}));
   if(negativeMode){if(diagnostics.privateChat&&diagnostics.boundSender&&diagnostics.userSender&&diagnostics.textMessage&&!diagnostics.commandMatched){console.log(JSON.stringify({check:'feishu-negative',status:'ordinary-text-ignored',eventReceived:true,replyAttempted:false}));finish(0);}return;}
   if(!matches)return;
   claimed=true;
   console.log(JSON.stringify({check:'feishu',status:'reply-attempting',eventReceived:true}));
   try{
     const r=await client.im.v1.message.create({params:{receive_id_type:'chat_id'},data:{receive_id:event.message.chat_id,msg_type:'text',content:JSON.stringify({text:'LUBAN_S0_OK · 仅验证收发，不执行网页任务'})}});
     console.log(JSON.stringify({check:'feishu',status:r.code===0?'platform-accepted':'send-failed',eventReceived:true,messageId:r.data?.message_id??null,code:r.code}));
     finish(r.code===0?0:1);
   }catch(e){const code=e?.response?.data?.code,status=e?.response?.status;console.error(JSON.stringify({check:'feishu',status:'send-error-or-unknown',eventReceived:true,...(typeof code==='number'?{code}:{}),...(typeof status==='number'?{httpStatus:status}:{})}));finish(1);}
 }})});
 if(!finished)console.log(negativeMode?'LISTENING_FOR_BOUND_USER_ORDINARY_TEXT (receive-only; 5 minutes)':'LISTENING_FOR_BOUND_USER_LUBAN_S0_PING (5 minutes)');
}catch{console.error('FEISHU_PROBE_FAILED (check app permissions/config/network; details suppressed)');finish(1);}
