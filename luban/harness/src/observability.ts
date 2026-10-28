import {resourceFromAttributes} from '@opentelemetry/resources';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {BaseCallbackHandler} from '@langchain/core/callbacks/base';
import type {LLMResult} from '@langchain/core/outputs';
import {NodeTracerProvider,BatchSpanProcessor} from '@opentelemetry/sdk-trace-node';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {ROOT_CONTEXT,trace,SpanStatusCode,type Span,type Context,type Attributes} from '@opentelemetry/api';
import {modelFailureCode} from './model-errors.js';
const safeCode=(value:unknown)=>typeof value==='string'&&/^[A-Z_]{2,64}$/.test(value)?value:undefined;
const numeric=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
export function telemetryConfig(env:NodeJS.ProcessEnv){
 if(env.LUBAN_LANGFUSE_ENABLED!=='true')return null;
 try{const url=new URL(env.LANGFUSE_BASE_URL??'');if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))return null;if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return null;
 if(!env.LANGFUSE_PUBLIC_KEY||!env.LANGFUSE_SECRET_KEY)return null;
 return {url:url.origin+'/api/public/otel/v1/traces',headers:{Authorization:'Basic '+Buffer.from(env.LANGFUSE_PUBLIC_KEY+':'+env.LANGFUSE_SECRET_KEY).toString('base64'),...(env.LUBAN_LANGFUSE_INGESTION_VERSION==='4'?{'x-langfuse-ingestion-version':'4'}:{})}};
 }catch{return null;}
}
/** Allowlisted summaries only; never serialize prompts, URLs, tool arguments or arbitrary errors. */
export function resultAttributes(output:unknown):Attributes{
 if(!output||typeof output!=='object')return {};
 const value=output as Record<string,unknown>;const attributes:Attributes={};
 for(const name of ['targets','selected','ids','diagnostics'])if(Array.isArray(value[name]))attributes['luban.'+name+'.count']=value[name].length;
 if(typeof value.passed==='boolean')attributes['luban.passed']=value.passed;
 if(typeof value.ok==='boolean')attributes['luban.ok']=value.ok;
 if(safeCode(value.code))attributes['luban.error.code']=safeCode(value.code)!;
 if(Array.isArray(value.diagnostics)){const codes=value.diagnostics.map(item=>safeCode(typeof item==='string'?item:(item as {code?:unknown})?.code)).filter((item):item is string=>!!item);attributes['luban.diagnostics']=codes.slice(0,20);}
 if(['ready','answered','incomplete','needs_clarification','stopped','needsEvidence','candidate'].includes(String(value.status)))attributes['luban.outcome']=String(value.status);
 return attributes;
}
export class MetadataCallbacks extends BaseCallbackHandler {
 name='LubanMetadataTracing';raiseError=false;private spans=new Map<string,Span>();private fingerprintKey=randomBytes(32);private calls=new Set<string>();private modelCalls=0;private toolCalls=0;private repeatedTools=0;
 constructor(private tracer:ReturnType<NodeTracerProvider['getTracer']>,private root:Context,private common:Attributes={},private modelName?:string){super();}
 private start(id:string,parent:string|undefined,name:string,attributes:Attributes={}){if(this.spans.size>=512)return;const parentSpan=parent?this.spans.get(parent):undefined;this.spans.set(id,this.tracer.startSpan(name,{attributes:{...this.common,...attributes}},parentSpan?trace.setSpan(this.root,parentSpan):this.root));}
 private end(id:string,attributes:Attributes={},error?:unknown){const span=this.spans.get(id);if(!span)return;span.setAttributes(attributes);if(attributes['luban.ok']===false||attributes['luban.passed']===false||attributes['luban.outcome']==='stopped')span.setStatus({code:SpanStatusCode.ERROR});if(error){span.setStatus({code:SpanStatusCode.ERROR});span.setAttribute('luban.error.code',safeCode((error as Error)?.message)??modelFailureCode(error));}span.end();this.spans.delete(id);}
 handleChainStart(_chain:unknown,_inputs:unknown,id:string,parent?:string,_tags?:string[],_metadata?:Record<string,unknown>,_runType?:string,name?:string){const allowed=['LangGraph','analyze','review','approval','claim','compile','revise','stopped','tools','model','agent'];this.start(id,parent,'graph.'+(name&&allowed.includes(name)?name:'step'),{'langfuse.observation.type':'chain'});}
 handleChainEnd(output:unknown,id:string){this.end(id,resultAttributes(output));}
 handleChainError(error:unknown,id:string){this.end(id,{},error);}
 handleChatModelStart(_model:unknown,_messages:unknown,id:string,parent?:string){this.modelCalls++;this.start(id,parent,'model.call',{'langfuse.observation.type':'generation',...(this.modelName?{'gen_ai.request.model':this.modelName}:{})});}
 handleLLMStart(_model:unknown,_prompts:unknown,id:string,parent?:string){this.modelCalls++;this.start(id,parent,'model.call',{'langfuse.observation.type':'generation',...(this.modelName?{'gen_ai.request.model':this.modelName}:{})});}
 handleLLMEnd(output:LLMResult,id:string){const attributes:Attributes={};const usage=(output.generations?.[0]?.[0] as unknown as {message?:{usage_metadata?:Record<string,unknown>}})?.message?.usage_metadata;const fallback=output.llmOutput?.tokenUsage as Record<string,unknown>|undefined;
 const input=numeric(usage?.input_tokens??fallback?.promptTokens),out=numeric(usage?.output_tokens??fallback?.completionTokens);if(input!==undefined)attributes['gen_ai.usage.input_tokens']=input;if(out!==undefined)attributes['gen_ai.usage.output_tokens']=out;this.end(id,attributes);}
 handleLLMError(error:unknown,id:string){this.end(id,{},error);}
 handleToolStart(tool:unknown,input:unknown,id:string,parent?:string){this.toolCalls++;const fingerprint=createHmac('sha256',this.fingerprintKey).update(typeof input==='string'?input:'').digest('hex').slice(0,24);const name=(tool as {name?:string})?.name;const allowed=['propose_requirement','read_page_context','propose_targets','propose_plan','request_generation','query_targets','inspect_target','review_selection','search_dom','read_dom_block','read_dom_blocks','search_resources','read_resource_excerpt','report_observation'];const signature=(name??'domain')+':'+fingerprint;if(this.calls.has(signature))this.repeatedTools++;this.calls.add(signature);this.start(id,parent,'tool.'+(name&&allowed.includes(name)?name:'domain'),{'langfuse.observation.type':'tool','luban.tool.fingerprint':fingerprint});}
 handleToolEnd(output:unknown,id:string){let value=output;if(typeof output==='string'&&output.length<=120000)try{value=JSON.parse(output);}catch{/* Only structured summaries are exported. */}this.end(id,resultAttributes(value));}
 handleToolError(error:unknown,id:string){this.end(id,{},error);}
 summary(){return {'luban.model.calls':this.modelCalls,'luban.tool.calls':this.toolCalls,'luban.tool.repeated':this.repeatedTools};}
 close(){for(const span of this.spans.values()){span.setAttribute('luban.incomplete',true);span.end();}this.spans.clear();}
}
export function createObservability(env:NodeJS.ProcessEnv,sessionId:string,kind:string,modelName?:string,run?:{epoch?:number;operationId?:string}){
 const config=telemetryConfig(env);if(!config)return null;
 const exporter=new OTLPTraceExporter({...config,timeoutMillis:1500});let exportStatus:'not-attempted'|'exported'|'failed'='not-attempted';const exportBatch=exporter.export.bind(exporter);exporter.export=(spans,callback)=>exportBatch(spans,result=>{if(result.code!==0)exportStatus='failed';else if(exportStatus!=='failed')exportStatus='exported';callback(result);});
 const provider=new NodeTracerProvider({resource:resourceFromAttributes({'service.name':'luban-harness'}),spanProcessors:[new BatchSpanProcessor(exporter,{exportTimeoutMillis:1800,maxQueueSize:512,maxExportBatchSize:128,scheduledDelayMillis:500})]});
 const common:Attributes={'langfuse.session.id':createHash('sha256').update(sessionId).digest('hex').slice(0,24),'luban.content.mode':'metadata-only',...(numeric(run?.epoch)!==undefined?{'luban.run.epoch':run!.epoch!}:{}),...(run?.operationId&&/^[a-f0-9-]{36}$/.test(run.operationId)?{'luban.operation.id':run.operationId}:{})};
 const tracer=provider.getTracer('luban.harness');const root=tracer.startSpan('luban.'+(['chat','resume','generate'].includes(kind)?kind:'task'),{attributes:common},ROOT_CONTEXT);const rootContext=trace.setSpan(ROOT_CONTEXT,root);const callbacks=new MetadataCallbacks(tracer,rootContext,common,modelName&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(modelName)&&!modelName.includes('://')&&!/^(sk-|pk-)/.test(modelName)?modelName:undefined);
 return {callbacks,traceId:root.spanContext().traceId,async operation<T>(name:string,work:()=>Promise<T>){const span=tracer.startSpan(name,{attributes:common},rootContext);try{const result=await work();const attributes=resultAttributes(result);span.setAttributes(attributes);if(attributes['luban.ok']===false||attributes['luban.passed']===false||attributes['luban.outcome']==='stopped')span.setStatus({code:SpanStatusCode.ERROR});return result;}catch(error){span.setStatus({code:SpanStatusCode.ERROR});span.setAttribute('luban.error.code',safeCode((error as Error)?.message)??modelFailureCode(error));throw error;}finally{span.end();}},async close(error?:unknown){root.setAttributes(callbacks.summary());callbacks.close();if(error){root.setStatus({code:SpanStatusCode.ERROR});root.setAttribute('luban.error.code',safeCode((error as Error)?.message)??modelFailureCode(error));}root.end();await provider.shutdown().catch(()=>{exportStatus='failed';});return exportStatus;}};
}
