type ModelError={name?:string;message?:string;code?:string;rpcMethod?:string;rpcCode?:number;cause?:unknown};
function rootError(raw:unknown):ModelError{let error=raw as ModelError;const seen=new Set();while(error?.cause&&typeof error.cause==='object'&&!seen.has(error.cause)&&seen.size<8){seen.add(error);error=error.cause as ModelError;}return error??{};}
export function safeModelDiagnostic(raw:unknown){const e=rootError(raw);return {name:e.name,agentCode:/^[A-Z_]{2,64}$/.test(e.code??e.message??'')?e.code??e.message:undefined,rpcMethod:typeof e.rpcMethod==='string'&&/^[a-z]+\/[a-z]+$/.test(e.rpcMethod)?e.rpcMethod:undefined,rpcCode:typeof e.rpcCode==='number'?e.rpcCode:undefined};}
export function modelFailureCode(raw:unknown){
 const error=rootError(raw);
 const known=/^HARNESS_MODEL_(?:CODEX_UNAVAILABLE|CODEX_INCOMPATIBLE|TOOL_DENIED|OUTPUT_INVALID)$/.exec((error as Error)?.message??'');if(known)return known[0];
 const agentCodes:Record<string,string>={AGENT_LOGIN_REQUIRED:'HARNESS_MODEL_AUTH',AGENT_AUTH_UNAVAILABLE:'HARNESS_MODEL_AUTH_UNAVAILABLE',AGENT_DISCONNECTED:'HARNESS_MODEL_CODEX_UNAVAILABLE',AGENT_RATE_LIMIT:'HARNESS_MODEL_RATE_LIMIT',AGENT_TIMEOUT:'HARNESS_MODEL_TIMEOUT',AGENT_START_FAILED:'HARNESS_MODEL_CODEX_UNAVAILABLE',AGENT_PROTOCOL_INVALID:'HARNESS_MODEL_CODEX_INCOMPATIBLE',AGENT_RPC_FAILED:'HARNESS_MODEL_CODEX_INCOMPATIBLE',AGENT_PERMISSION_REQUIRED:'HARNESS_MODEL_TOOL_DENIED'};if(agentCodes[(error as {code?:string})?.code??(error as Error)?.message??''])return agentCodes[(error as {code?:string})?.code??(error as Error)?.message??''];
 const e=error as {status?:number;name?:string;code?:string;message?:string};
 if(e.status===401||e.status===403)return 'HARNESS_MODEL_AUTH';
 if(e.status===429)return 'HARNESS_MODEL_RATE_LIMIT';
 if(e.status===400||e.status===404||e.status===422)return 'HARNESS_MODEL_REQUEST_REJECTED';
 if(e.code==='HARNESS_MODEL_OUTPUT_INVALID'||e.message==='HARNESS_MODEL_OUTPUT_INVALID'||e.name==='ZodError'||/parse|schema|structured/i.test(e.message??''))return 'HARNESS_MODEL_OUTPUT_INVALID';
 if(/timeout|timed out|abort/i.test((e.name??'')+' '+(e.message??'')))return 'HARNESS_MODEL_TIMEOUT';
 return 'HARNESS_MODEL_FAILED';
}
