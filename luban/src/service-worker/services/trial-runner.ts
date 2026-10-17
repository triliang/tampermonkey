import { inspectCode } from './code-quality';
import type { ScriptVersion } from '../../shared/v2-types';
import type { PageBinding } from '../../shared/p2-types';
import type { TrialResult } from '../../shared/p3-types';
import { DataError } from '../repositories/database';

export async function draftHash(v: ScriptVersion): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({code:v.code,grants:[...v.grants].sort(),runAt:v.runAt})));
  return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateTrial(v: ScriptVersion): void {
  const report=inspectCode(v.code,v.grants);if(!report.passed){const d=report.diagnostics.find(x=>x.severity==='error')!;throw new DataError(d.code,`${d.message}${d.line?`（第 ${d.line} 行）`:''}`);}
}
// 正文直接注入 MAIN，不用 eval/new Function 或 script 标签降级。相同内容在同一文档只执行一次。
export function trialSource(v: ScriptVersion, namespace: string, hash: string, values: Record<string,unknown>): string {
  return `(async()=>{ const key=${JSON.stringify('luban-trial:'+namespace+':'+hash)};
  const old=globalThis[key]; if(old) return {...await old,repeated:true,changes:[]};
  const work=(async()=>{const grants=new Set(${JSON.stringify(v.grants)}),store=Object.assign(Object.create(null),${JSON.stringify(values)}),changes=[];
  const GM_getValue=grants.has('GM_getValue')?((k,d)=>k in store?store[k]:d):undefined;
  const GM_setValue=grants.has('GM_setValue')?((k,v)=>{store[k]=v;changes.push({op:'set',key:k,value:v});}):undefined;
  const GM_deleteValue=grants.has('GM_deleteValue')?((k)=>{delete store[k];changes.push({op:'delete',key:k});}):undefined;
  const GM_addStyle=grants.has('GM_addStyle')?((css)=>{const s=document.createElement('style');s.dataset.lubanScript=${JSON.stringify(namespace)};s.textContent=css;document.documentElement.append(s);}):undefined;
  const info={script:{name:'鲁班试运行'},version:'0.2.0'};const GM_info=grants.has('GM_info')?(${/\bGM_info\s*\(/.test(v.code)}?Object.assign(()=>info,info):info):undefined;
  const unsafeWindow=grants.has('unsafeWindow')?window:undefined;
  let timer;try{return await Promise.race([(async()=>{try{await(async()=>{\n${v.code}\n})();return {ok:true,timedOut:false,changes};}catch(e){return {ok:false,timedOut:false,error:String(e),changes};}})(),new Promise(r=>{timer=setTimeout(()=>r({ok:false,timedOut:true,error:'执行超时，请刷新页面后重试',changes}),10000);})]);}finally{clearTimeout(timer);}})();
  globalThis[key]=work;const result=await work;if(!result.ok&&!result.timedOut)delete globalThis[key];return result;})()`;
}
export async function executeTrial(binding: PageBinding,v:ScriptVersion,namespace:string,hash:string,values:Record<string,unknown>):Promise<TrialResult>{
  const api=(chrome as unknown as {userScripts?:{execute:(input:unknown)=>Promise<Array<{documentId?:string;result?:TrialResult;error?:string}>>}}).userScripts;
  if(!api?.execute)throw new DataError('USER_SCRIPTS_REQUIRED','请在扩展详情页开启“允许用户脚本”。');
  const [r]=await api.execute({target:{tabId:binding.tabId,documentIds:[binding.documentId]},world:'MAIN',injectImmediately:true,js:[{code:trialSource(v,namespace,hash,values)}]});
  if(r?.documentId!==binding.documentId||!r.result||r.error)throw new DataError('INJECTION_FAILED',r?.error??'未收到目标文档的执行结果。');
  return r.result;
}
