import { hostPattern, hostPermissionOrigins } from '../../shared/host-policy';
export { hostPattern } from '../../shared/host-policy';
import bridgePath from '../../auto/bridge.ts?script&iife';
import type { ScriptRecord, ScriptVersion } from '../../shared/v2-types';
import { autoSource } from './auto-source';
import { DataError } from '../repositories/database';
export const registrationId=(id:string)=>'luban-v2-'+id;
export const bridgeId=(host:string)=>'luban-bridge-'+host;
export interface AutoAdapter{
  permission(host:string):Promise<boolean>;
  install(record:ScriptRecord,version?:ScriptVersion):Promise<void>;
  remove(id:string):Promise<void>;
  syncBridges(hosts:string[]):Promise<void>;
  prune(ids:string[]):Promise<void>;
  inspect?(record:ScriptRecord):Promise<unknown>;
}
interface UserScriptsApi{getScripts():Promise<Array<{id:string;matches?:string[];world?:string;runAt?:string;js?:Array<{code?:string;file?:string}>}>>;register(scripts:unknown[]):Promise<void>;update(scripts:unknown[]):Promise<void>;unregister(filter:{ids:string[]}):Promise<void>;}
function api():UserScriptsApi{const value=(chrome as unknown as {userScripts?:UserScriptsApi}).userScripts;if(!value)throw new DataError('USER_SCRIPTS_REQUIRED','请开启“允许用户脚本”后重试。');return value;}
export class ChromeAutoAdapter implements AutoAdapter{
  permission(host:string){return chrome.permissions.contains({origins:hostPermissionOrigins(host)});}
  async inspect(record:ScriptRecord){
    let permission=false,permissionError='',userScriptsError='',bridgesError='';
    try{permission=!!record.host&&await this.permission(record.host);}catch(e){permissionError=String(e);}
    let registered:unknown=null,bridge:unknown=null;
    try{const found=(await api().getScripts()).find(s=>s.id===registrationId(record.id));if(found){
      const code=found.js?.map(j=>j.code??'').join('')??'';let identity:unknown=null;
      try{identity=JSON.parse(/const identity=(\{[^;]+\});/.exec(code)?.[1]??'null');}catch{/* 只解析 JSON，不执行 source */}
      registered={id:found.id,matches:found.matches,world:found.world,runAt:found.runAt,identity,sourceMatchesExpected:code===autoSource(record),sourceLength:code.length};
    }}catch(e){userScriptsError=String(e);}
    try{const found=(await chrome.scripting.getRegisteredContentScripts()).find(s=>s.id===bridgeId(record.host??''));if(found)bridge={id:found.id,matches:found.matches,world:found.world,runAt:found.runAt,js:found.js};}catch(e){bridgesError=String(e);}
    const manifest=chrome.runtime.getManifest();
    return{extensionVersion:manifest.version,declaredOptionalHostPermissions:manifest.optional_host_permissions??[],requestedOrigins:record.host?hostPermissionOrigins(record.host):[],permission,permissionError,registered,userScriptsError,bridge,bridgesError};
  }
  async install(record:ScriptRecord,version=record.current){
    const scripts=api(),id=registrationId(record.id);
    // V2 固定 document_end；旧 start/idle 需先重新生成和试运行。
    const data={id,matches:[hostPattern(record.host!)],allFrames:false,world:'MAIN',runAt:'document_end',js:[{code:autoSource(record,version)}]};
    if((await scripts.getScripts()).some(s=>s.id===id))await scripts.update([data]);else await scripts.register([data]);
  }
  async remove(id:string){const scripts=api(),key=registrationId(id);if((await scripts.getScripts()).some(s=>s.id===key))await scripts.unregister({ids:[key]});}
  async prune(ids:string[]){const scripts=api(),keep=new Set(ids.map(registrationId));const stale=(await scripts.getScripts()).filter(s=>s.id.startsWith('luban-v2-')&&!keep.has(s.id));if(stale.length)await scripts.unregister({ids:stale.map(s=>s.id)});}
  async syncBridges(hosts:string[]){
    const desired=new Set(hosts.map(bridgeId)),existing=await chrome.scripting.getRegisteredContentScripts();
    const stale=existing.filter(s=>s.id.startsWith('luban-bridge-')&&!desired.has(s.id));if(stale.length)await chrome.scripting.unregisterContentScripts({ids:stale.map(s=>s.id)});
    for(const host of hosts){const data={id:bridgeId(host),matches:[hostPattern(host)],js:[bridgePath],runAt:'document_start' as const,allFrames:false,persistAcrossSessions:true,world:'ISOLATED' as const};
      if(existing.some(s=>s.id===data.id))await chrome.scripting.updateContentScripts([data]);else await chrome.scripting.registerContentScripts([data]);}
  }
}
