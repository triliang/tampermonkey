// Shared, deterministic compiler. This module has no model, browser, or execution capabilities.
const fail=code=>{throw Error(code);};
export function validatePlan(raw,envelope){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['planHash','action','targetIds'].includes(k)))fail('PLAN_IR_INVALID');
 if(typeof envelope.planHash!=='string'||!envelope.planHash||envelope.planHash.length>128)fail('PLAN_ENVELOPE_CHANGED');
 if(raw.planHash!==envelope.planHash||raw.action!==envelope.action)fail('PLAN_ENVELOPE_CHANGED');
 if(!['hide','dim'].includes(raw.action)||!Array.isArray(raw.targetIds)||!raw.targetIds.length||raw.targetIds.length>40||new Set(raw.targetIds).size!==raw.targetIds.length)fail('PLAN_IR_INVALID');
 const ids=envelope.targets.map(t=>t.id);
 if(new Set(ids).size!==ids.length||ids.length!==raw.targetIds.length||raw.targetIds.some(id=>typeof id!=='string'||!ids.includes(id)))fail('PLAN_SCOPE_CHANGED');
 return {planHash:raw.planHash,action:raw.action,targetIds:[...raw.targetIds]};
}
export function validateSelector(selector){
 // Selectors are supplied only by the host's live identity/uniqueness check, never by the model.
 // Reject CSS declaration injection and selector-list expansion, including escaped forms.
 if(typeof selector!=='string'||!selector.trim()||selector.length>1000||/[{},;@\x00-\x1f\x7f\\]|\/\*|\*\//.test(selector)||/:(?:is|where|has|not)\s*\(/i.test(selector))fail('SELECTOR_POLICY_REJECTED');
 return selector;
}
export function compilePlan(raw,envelope){
 const plan=validatePlan(raw,envelope);
 const selectors=plan.targetIds.map(id=>validateSelector(envelope.targets.find(t=>t.id===id).selector));
 if(new Set(selectors).size!==selectors.length)fail('SELECTOR_NOT_UNIQUE');
 const declaration=plan.action==='hide'?'display:none!important':'opacity:0.25!important';
 const css=selectors.map(s=>`${s}{${declaration}}`).join('\n');
 // JSON encoding keeps CSS quotes/Unicode out of JavaScript syntax. No arbitrary code is accepted.
 const code=`(() => {\n  "use strict";\n  const css = ${JSON.stringify(css)};\n  const key = ${JSON.stringify("luban-plan-"+plan.planHash)};\n  if (document.getElementById(key)) return;\n  const style = document.createElement("style");\n  style.id = key;\n  style.textContent = css;\n  (document.head || document.documentElement).appendChild(style);\n})();`;
 return {code,grants:[],explanation:`${plan.action==='hide'?'隐藏':'弱化'}已确认的 ${selectors.length} 处区域；未确认范围不在规则中。`,plan};
}
function line(value,max=200){if(typeof value!=='string'||!value.trim()||/[\r\n\x00-\x1f\x7f\u2028\u2029]/.test(value)||value.length>max)fail('USERSCRIPT_METADATA_INVALID');return value.trim();}
export function serializeUserscript(body,metadata){
 if(typeof body!=='string'||!body.trim()||/==\/?UserScript==/.test(body))fail('USERSCRIPT_DUPLICATE_HEAD');
 const {name,namespace,version,description,matches,runAt,grants}=metadata;
 if(!Array.isArray(matches)||matches.length!==1||!/^\*:\/\/[a-z0-9.-]+(?::\d+)?\/\*$/i.test(matches[0]))fail('USERSCRIPT_MATCH_INVALID');
 if(!['document-start','document-end','document-idle'].includes(runAt)||!Array.isArray(grants)||new Set(grants).size!==grants.length||grants.some(g=>!['GM_addStyle','GM_getValue','GM_setValue','GM_deleteValue','GM_info','unsafeWindow'].includes(g)))fail('USERSCRIPT_GRANTS_INVALID');
 const head=['// ==UserScript==',`// @name         ${line(name,100)}`,`// @namespace    ${line(namespace)}`,`// @version      ${line(version,100)}`,`// @description  ${line(description)}`,`// @match        ${matches[0]}`,`// @run-at       ${runAt}`,...(grants.length?grants:['none']).map(g=>'// @grant        '+g),'// ==/UserScript=='];
 return head.join('\n')+'\n\n'+body.replace(/\r\n?/g,'\n').replace(/\n+$/,'')+'\n';
}
export function parseUserscript(content){
 if(!content.startsWith('// ==UserScript==\n'))fail('USERSCRIPT_HEADER_REQUIRED');
 const end=content.indexOf('// ==/UserScript==\n');if(end<0)fail('USERSCRIPT_HEADER_INVALID');
 const fields={};for(const row of content.slice('// ==UserScript==\n'.length,end).trimEnd().split('\n')){const m=/^\/\/ @([\w-]+)\s+(.+)$/.exec(row);if(!m||!['name','namespace','version','description','match','run-at','grant'].includes(m[1]))fail('USERSCRIPT_METADATA_INVALID');(fields[m[1]]??=[]).push(m[2]);}
 for(const key of ['name','namespace','version','description','match','run-at'])if(fields[key]?.length!==1)fail('USERSCRIPT_METADATA_INVALID');
 if(!fields.grant?.length||fields.grant.includes('none')&&fields.grant.length!==1)fail('USERSCRIPT_GRANTS_INVALID');
 const metadata={name:fields.name[0],namespace:fields.namespace[0],version:fields.version[0],description:fields.description[0],matches:fields.match,runAt:fields['run-at'][0],grants:fields.grant[0]==='none'?[]:fields.grant};
 const body=content.slice(end+'// ==/UserScript==\n'.length).replace(/^\n/,'');
 if(serializeUserscript(body,metadata)!==content)fail('USERSCRIPT_NOT_CANONICAL');
 return {metadata,body};
}
