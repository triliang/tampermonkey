import {readFileSync} from 'node:fs';import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {parseEnv} from 'node:util';
import {createObservability} from '../harness/dist/observability.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const env=parseEnv(readFileSync(join(root,'.local/langfuse/bridge.env'),'utf8'));
const health=await fetch(env.LANGFUSE_BASE_URL+'/api/public/health',{signal:AbortSignal.timeout(5000)}).catch(()=>null);
if(!health?.ok){console.error('Langfuse health check failed ('+(health?.status??'connection/timeout')+'). Start Docker and run langfuse-local.mjs up first.');process.exit(1);}
const observer=createObservability(env,'luban-local-smoke','chat');if(!observer)throw Error('Invalid private tracing configuration');
await observer.operation('bridge.smoke',async()=>({targets:[],diagnostics:[]}));await observer.close();
// Confirm persistence, rather than mistaking a healthy web server for accepted telemetry.
const headers={Authorization:'Basic '+Buffer.from(env.LANGFUSE_PUBLIC_KEY+':'+env.LANGFUSE_SECRET_KEY).toString('base64')};
let confirmed=false;
for(let attempt=0;attempt<15;attempt++){
 const response=await fetch(env.LANGFUSE_BASE_URL+'/api/public/traces/'+observer.traceId,{headers,signal:AbortSignal.timeout(5000)}).catch(()=>null);
 if(response?.ok){const value=await response.json();if(value.id===observer.traceId){confirmed=true;break;}}
 if(response?.status===401||response?.status===403)break;
 const observations=await fetch(env.LANGFUSE_BASE_URL+'/api/public/v2/observations?traceId='+observer.traceId,{headers,signal:AbortSignal.timeout(5000)}).catch(()=>null);
 if(observations?.ok){const value=await observations.json();if(Array.isArray(value.data)&&value.data.some(item=>item.traceId===observer.traceId)){confirmed=true;break;}}
 await new Promise(r=>setTimeout(r,2000));
}
console.log(JSON.stringify({traceId:observer.traceId,verified:confirmed}));
if(!confirmed){console.error('Trace persistence was not confirmed. Check API permissions/version, ingestion delay and Langfuse UI; this is not a passed acceptance.');process.exitCode=1;}
