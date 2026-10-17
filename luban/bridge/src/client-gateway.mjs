import {z} from 'zod';import {PROTOCOL_VERSION,protocolError} from './protocol.mjs';
import {ToolService,publicPages} from './tool-service.mjs';
const request=z.object({protocolVersion:z.literal(PROTOCOL_VERSION),requestId:z.string().min(1).max(128),method:z.enum(['pages.list','tools.get','tools.submit','tools.requestTrial','tasks.submit','tasks.get','tasks.cancel','tasks.events']),params:z.record(z.string(),z.unknown()).default({})}).strict();
export class ClientGateway {
 constructor(credentials,services,{cancelOnDisconnect=false}={}){this.credentials=credentials;this.services=services;this.cancelOnDisconnect=cancelOnDisconnect;this.submitted=new Set();this.tools=new ToolService(services.profiles,services.coordinator);this.principal=services.clients.authenticate(credentials);}
 handle(raw){const requestId=typeof raw?.requestId==='string'&&raw.requestId.length<=128?raw.requestId:'';try{const r=request.parse(raw),principal=this.services.clients.authenticate(this.credentials);let data;
  if(r.method==='pages.list'){if(Object.keys(r.params).length)throw protocolError('INVALID_PARAMS');data={pages:publicPages(this.services.profiles,principal.profileId)};}
  else if(r.method.startsWith('tools.'))data=this.tools.call(principal,{'tools.get':'read','tools.submit':'submit','tools.requestTrial':'trial'}[r.method],r.params);
  else if(r.method==='tasks.submit')data=this.services.coordinator.submit(principal,r.params);
  else {const p=z.object({taskId:z.string().uuid(),after:z.number().int().nonnegative().optional()}).strict().parse(r.params);if(r.method==='tasks.get')data=this.services.coordinator.get(principal,p.taskId);else if(r.method==='tasks.cancel')data=this.services.coordinator.cancel(principal,p.taskId);else{this.services.coordinator.get(principal,p.taskId);data={events:this.services.tasks.events(p.taskId,p.after??0)};}}
  if(data?.task?.id&&['tasks.submit','tools.get','tools.submit','tools.requestTrial'].includes(r.method))this.submitted.add(data.task.id);
  return {protocolVersion:PROTOCOL_VERSION,requestId:r.requestId,ok:true,data};
 }catch(e){const code=e.name==='ZodError'?'INVALID_REQUEST':e.code??'INTERNAL_ERROR';return {protocolVersion:PROTOCOL_VERSION,requestId,ok:false,error:{code,message:code}};}}
 close(){if(!this.cancelOnDisconnect)return;for(const id of this.submitted){const task=this.services.tasks.get(id);if(task&&['queued','running','cancelRequested'].includes(task.state))this.services.coordinator.cancel(this.principal,id);}this.submitted.clear();}
}
