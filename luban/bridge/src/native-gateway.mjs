import {requestSchema,pageSyncSchema,PROTOCOL_VERSION,BRIDGE_VERSION,protocolError} from './protocol.mjs';
const nativeSessions=new WeakMap();
// Chrome authenticates the native origin; profile credentials further separate
// Chrome profiles which load the same extension ID. No page access is implied.
export class NativeGateway {
 constructor(profiles,extensionId,services=null){this.services=services;this.profiles=profiles;this.extensionId=extensionId;this.credentials=null;this.retired=false;if(!nativeSessions.has(profiles))nativeSessions.set(profiles,new Map());this.sessions=nativeSessions.get(profiles);}
 activate(credentials){const previous=this.sessions.get(credentials.profileId);if(previous&&previous!==this)previous.close();this.credentials={...credentials};this.sessions.set(credentials.profileId,this);}
 handle(raw){const requestId=typeof raw?.requestId==='string'&&raw.requestId.length<=128?raw.requestId:'';
  try{if(this.retired)throw protocolError('NATIVE_SESSION_REPLACED');const req=requestSchema.parse(raw);let data;if(['health.get','profile.revoke','pages.list'].includes(req.method)&&Object.keys(req.params).length)throw protocolError('INVALID_PARAMS');
   if(req.method==='health.get')data={service:'luban-bridge',version:BRIDGE_VERSION,protocolVersion:PROTOCOL_VERSION,node:process.version,platform:process.platform,arch:process.arch,capabilities:['profile.pair','profile.authenticate','profile.revoke','pages.list',...(this.services?['clients.enroll','tasks.pull','tasks.check','tasks.finish','tasks.confirm','tasks.deny','tasks.review','maintenance.run','diagnostics.export',...(this.services.harness?['harness.status','harness.open','harness.message']:[])]:[])],pageCapabilities:[]};
   else if(req.method==='profile.pair'){if(Object.keys(req.params).length)throw protocolError('INVALID_PARAMS');if(this.credentials)throw protocolError('ALREADY_PAIRED');data=this.profiles.pair(this.extensionId);this.activate(data);}
   else if(req.method==='profile.authenticate'){const principal=this.profiles.authenticate(this.extensionId,req.params);if(this.credentials&&this.credentials.profileId!==principal.profileId)throw protocolError('ALREADY_PAIRED');this.activate(req.params);data={profileId:principal.profileId,paired:true};}
   else {if(!this.credentials)throw protocolError('PAIRING_REQUIRED');const principal=this.profiles.authenticate(this.extensionId,this.credentials);
    if(req.method==='profile.revoke'){if(this.services?.channel?.state==='connected'&&this.services.channel.profileId===principal.profileId)void this.services.channel.disconnect(principal).catch(()=>{});this.services?.agent?.disconnected(principal.profileId);this.services?.harness?.disconnected(principal.profileId);this.profiles.revoke(principal);this.services?.coordinator?.disconnected(principal.profileId);this.sessions.delete(principal.profileId);this.credentials=null;data={revoked:true};}
    else if(req.method.startsWith('channel.')){if(!this.services?.channel)throw protocolError('CAPABILITY_UNAVAILABLE');data=this.services.channel[req.method.slice(8)](principal,req.params);}
    else if(req.method.startsWith('harness.')){if(!this.services?.harness)throw protocolError('CAPABILITY_UNAVAILABLE');const method=req.method.slice(8);data=method==='status'?this.services.harness.status():this.services.harness[method](principal,req.params);}
    else if(req.method.startsWith('agent.')){if(!this.services?.agent)throw protocolError('CAPABILITY_UNAVAILABLE');data=req.method==='agent.status'?this.services.agent.status():this.services.agent[req.method.slice(6)](principal,req.params);}
    else if(req.method==='maintenance.run'){if(!this.services)throw protocolError('CAPABILITY_UNAVAILABLE');data=this.services.maintain();}
    else if(req.method==='diagnostics.export'){if(!this.services)throw protocolError('CAPABILITY_UNAVAILABLE');data=this.services.diagnostics.export();}
    else if(req.method==='clients.enroll'){if(!this.services)throw protocolError('CAPABILITY_UNAVAILABLE');data=this.services.clients.enroll(principal,req.params);}
    else if(req.method==='clients.list')data={clients:this.services.clients.list(principal.profileId)};
    else if(req.method==='clients.revoke'){this.services.clients.revoke(principal.profileId,req.params.clientId);data={revoked:true};}
    else if(req.method==='tasks.get'){const taskId=req.params.taskId;if(typeof taskId!=='string'||Object.keys(req.params).length!==1)throw protocolError('INVALID_PARAMS');this.services.coordinator.owned(principal,taskId);data={task:this.services.tasks.get(taskId)};}
    else if(req.method==='tasks.list')data={tasks:this.services.coordinator.list(principal)};
    else if(req.method==='tasks.pull')data=this.services.coordinator.pull(principal);
    else if(req.method==='tasks.check')data=this.services.coordinator.check(principal,req.params);
    else if(req.method==='tasks.finish')data=this.services.coordinator.finish(principal,req.params);
    else if(req.method==='tasks.confirm')data=this.services.coordinator.confirm(principal,req.params);
    else if(req.method==='tasks.deny')data=this.services.coordinator.deny(principal,req.params);
    else if(req.method==='tasks.review')data=this.services.coordinator.review(principal,req.params);
    else if(req.method==='tasks.cancelAck')data=this.services.coordinator.cancelAck(principal,req.params);
    else if(req.method==='pages.sync'){const {pages}=pageSyncSchema.parse(req.params);if(new Set(pages.map(p=>p.pageRef)).size!==pages.length)throw protocolError('INVALID_PARAMS');this.profiles.syncPages(principal.profileId,pages);this.services?.coordinator?.pagesChanged(principal.profileId);data={count:pages.length};}
    else if(req.method==='pages.list')data={pages:this.profiles.pages(principal.profileId).map(({pageRef,title,url,capabilities})=>({pageRef,title,url,capabilities}))};
    else throw protocolError('PAGE_NOT_GRANTED');
   }
   if(data instanceof Promise)return data.then(value=>({protocolVersion:PROTOCOL_VERSION,requestId:req.requestId,ok:true,data:value})).catch(error=>({protocolVersion:PROTOCOL_VERSION,requestId:req.requestId,ok:false,error:{code:/^[A-Z_]{2,64}$/.test(error.code??'')?error.code:'CHANNEL_FAILED',message:'CHANNEL_FAILED'}}));
   return {protocolVersion:PROTOCOL_VERSION,requestId:req.requestId,ok:true,data};
  }catch(e){const code=e?.name==='ZodError'?'INVALID_REQUEST':e?.code??'INTERNAL_ERROR';return {protocolVersion:PROTOCOL_VERSION,requestId,ok:false,error:{code,message:code}};}
 }
 close(){this.retired=true;const credentials=this.credentials;this.credentials=null;if(!credentials||this.sessions.get(credentials.profileId)!==this)return;this.sessions.delete(credentials.profileId);if(this.services?.channel?.state==='connected'&&this.services.channel.profileId===credentials.profileId)void this.services.channel.disconnect({profileId:credentials.profileId}).catch(()=>{});this.services?.agent?.disconnected(credentials.profileId);this.services?.harness?.disconnected(credentials.profileId);this.profiles.clearPages(credentials.profileId);this.services?.coordinator?.disconnected(credentials.profileId);}
}
