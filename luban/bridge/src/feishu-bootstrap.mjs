// Extract only binding metadata from a challenge sent by the already-bound user.
// This does not grant access, send a message, or execute a browser task.
export function feishuBootstrapBinding(event,config,challenge,expiresAt,now=Date.now()){
 if(now>=expiresAt||typeof challenge!=='string'||!challenge.startsWith('LUBAN_V3_SETUP_'))return null;
 const sender=event?.sender,message=event?.message;
 if(sender?.sender_type!=='user'||sender.sender_id?.open_id!==config.senderOpenId||message?.chat_type!=='p2p'||message.message_type!=='text'||typeof message.message_id!=='string')return null;
 if(event.header?.app_id&&event.header.app_id!==config.appId)return null;
 let text;try{text=JSON.parse(message.content).text;}catch{return null;}
 if(text!==challenge||typeof sender.tenant_key!=='string'||!sender.tenant_key.trim()||sender.tenant_key.length>128)return null;
 if(config.tenantKey&&config.tenantKey!==sender.tenant_key)return null;
 if(!config.credentialRef||config.credentialRef.account!==config.appId)return null;
 return {appId:config.appId,senderOpenId:config.senderOpenId,tenantKey:sender.tenant_key,credentialRef:config.credentialRef};
}
