export type HarnessModelConfig={backend:'codex'}|{backend:'api';baseUrl:string;model:string;apiKey:string};
// Loading API credentials is deliberately lazy: local Codex uses its own login.
export async function harnessModelConfig(executor:unknown,loadApi:()=>Promise<{baseUrl:string;model:string;apiKey:string}>):Promise<HarnessModelConfig>{
 if(executor==='codex')return {backend:'codex'};
 return {backend:'api',...await loadApi()};
}

// Protocol v1 alone cannot distinguish older strict configuration schemas.
export function requireHarnessConfiguration(status:Record<string,unknown>,executor:unknown):void{
 const backend=executor==='codex'?'codex':'api';
 if(status.configurationVersion!==2||!Array.isArray(status.modelBackends)||!status.modelBackends.includes(backend))throw Error('HARNESS_BRIDGE_UPGRADE_REQUIRED');
}
