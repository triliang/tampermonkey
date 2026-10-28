import {parseUserscript} from '../../../contracts/script-plan.mjs';
import { parse } from 'acorn';
import type { ScriptStore } from '../script-store';
import type { ScriptRecord } from '../../shared/v2-types';
import type { ExportArtifact } from '../../shared/p5-types';
import { GM_P0_GRANTS } from '../../shared/constants';
import { draftHash } from './trial-runner';
import { DataError } from '../repositories/database';
import { hostPattern } from '../../shared/host-policy';
type Node={type:string;name?:string;value?:unknown;[key:string]:unknown};
const supported=new Set<string>(GM_P0_GRANTS);
const blocked=(message:string):never=>{throw new DataError('EXPORT_INCOMPATIBLE',message+' 请重新生成、试运行并保存标准兼容代码后再导出。');};
export function exportGrants(code:string,declared:string[]):string[]{
  if(declared.some(g=>!supported.has(g)))blocked('保存版声明了不支持的授权。');
  let tree:Node;
  try{tree=parse(code,{ecmaVersion:'latest',sourceType:'script'}) as unknown as Node;}catch{blocked('保存版不能作为独立标准脚本解析（可能含顶层 await/return）。');}
  const used=new Set<string>();
  function visit(node:Node,parent?:Node,key?:string){
    if(node.type==='Literal'&&typeof node.value==='string'&&/^luban-v2-(request|response)$/.test(node.value))blocked('保存版依赖鲁班私有通信桥。');
    if(node.type==='MemberExpression'){
      const object=node.object as Node,property=node.property as Node;
      const prop=node.computed?property.value:property.name;
      if(typeof prop==='string'&&/^GM(?:_|$)/.test(prop))blocked('不支持通过对象属性动态引用 GM API。');
      if(node.computed&&object.type==='Identifier'&&['window','globalThis','unsafeWindow'].includes(object.name??'')&&property.type!=='Literal')blocked('无法确认动态全局属性是否依赖 GM API。');
      if(object.type==='Identifier'&&object.name==='GM_info'&&prop!=='script'&&prop!=='version'&&prop!=='scriptHandler')blocked('无法确认 GM_info 的动态或函数式用法。');
    }
    if(node.type==='Identifier'){
      const name=node.name!;
      const isProperty=parent?.type==='MemberExpression'&&key==='property'&&!parent.computed;
      const isObjectKey=(parent?.type==='Property'||parent?.type==='MethodDefinition')&&key==='key'&&!parent.computed&&!parent.shorthand;
      if(!isProperty&&!isObjectKey){
        if(name==='chrome'||name.startsWith('__luban'))blocked('保存版依赖扩展私有运行环境。');
        if(name==='GM'||name.startsWith('GM_')||name==='unsafeWindow'){
          if(!supported.has(name))blocked(`不支持的 API：${name}。`);
          if(!declared.includes(name))blocked(`保存版缺少 ${name} 授权。`);
          if(name==='GM_info'){
            if(parent?.type==='CallExpression'||parent?.type==='NewExpression'||(parent?.type!=='MemberExpression'&&parent?.type!=='UnaryExpression'))blocked('旧函数式或别名 GM_info 无法标准兼容导出。');
          }else if(name!=='unsafeWindow'&&!(parent?.type==='CallExpression'&&key==='callee')&&parent?.type!=='UnaryExpression')blocked(`不支持 ${name} 的别名或动态用法。`);
          used.add(name);
        }
      }
    }
    for(const[k,value]of Object.entries(node)){
      if(Array.isArray(value)){for(const item of value)if(item&&typeof item==='object'&&typeof item.type==='string')visit(item,node,k);}
      else if(value&&typeof value==='object'&&'type' in value)visit(value as Node,node,k);
    }
  }
  visit(tree!);return [...used].sort();
}
function safeName(name:string){return name.replace(/[\x00-\x1f\x7f\u2028\u2029]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'鲁班工具';}
export async function buildUserscript(record:ScriptRecord,hasDraft=false):Promise<ExportArtifact>{
  if(record.tombstone)throw new DataError('SCRIPT_MISSING','工具已删除。');
  if(!record.host||record.needsRuleReview||record.matches.length!==1||record.matches[0]!==hostPattern(record.host))blocked('适用网站规则尚未确认。');
  const version=record.current,hash=await draftHash(version);
  if(hash!==version.hash)throw new DataError('VERSION_HASH_MISMATCH','保存版校验失败，未导出。');
  const grants=exportGrants(version.code,version.grants),name=safeName(record.name);
  const existing=version.code.startsWith('// ==UserScript==')?parseUserscript(version.code):null;
  if(existing&&(JSON.stringify(existing.metadata.matches)!==JSON.stringify(record.matches)||existing.metadata.runAt!==({document_start:'document-start',document_end:'document-end',document_idle:'document-idle'}[version.runAt])||JSON.stringify([...existing.metadata.grants].sort())!==JSON.stringify(grants)))blocked('脚本头与结构化权限或适用范围不一致。');
  const filename=(name.replace(/[\\/:*?"<>|]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,80)||'luban-tool')+'.user.js';
  const runAt={document_start:'document-start',document_end:'document-end',document_idle:'document-idle'}[version.runAt];
  const head=['// ==UserScript==',`// @name         ${name}`,'// @namespace    https://luban.local/userscripts',`// @version      ${Math.floor(version.createdAt)}.${record.recordRevision}`,`// @match        ${record.matches[0]}`,`// @run-at       ${runAt}`,...(grants.length?grants:['none']).map(g=>'// @grant        '+g),'// ==/UserScript=='];
  return{filename,content:existing?version.code:head.join('\n')+'\n\n'+version.code+'\n',versionId:version.versionId,hash,hasDraft,grants};
}
export async function exportCurrent(store:ScriptStore,id:string):Promise<ExportArtifact>{
  const record=await store.record(id);if(!record)throw new DataError('SCRIPT_MISSING','工具不存在。');
  const hasDraft=(await store.workspaces.list()).some(w=>w.scriptId===id&&(w.draft!==null||!!w.input));
  return buildUserscript(record,hasDraft);
}
