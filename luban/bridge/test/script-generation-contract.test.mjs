import test from 'node:test';import assert from 'node:assert/strict';
import {validateGenerationEnvelope,validateScriptCandidate} from '../../contracts/script-generation.mjs';
const envelope=()=>({version:1,operationId:'operation',decisionId:'generation-decision',binding:{pageRef:'page',documentId:'document',navigationEpoch:1,scopeRevision:2,requirementRevision:3,scopeHash:'host-hash',baselineHash:null},requirement:{goal:'按用户要求处理已确认范围',constraints:['保留相邻内容'],expectedOutcomes:['满足本次用户要求，保留区域不变']},scopes:[{id:'target',role:'target',locator:'#confirmed',evidenceRefs:['read-target']},{id:'preserve',role:'preserve',locator:'#keep',evidenceRefs:['read-keep']}],policy:{allowedGrants:[],maxCodeBytes:250000}});
const candidate=(code='document.querySelector("#confirmed").remove();')=>({operationId:'operation',decisionId:'generation-decision',binding:envelope().binding,code,grants:[],explanation:'根据本次已确认目标生成',evidenceRefs:['read-target']});
test('generic code contracts accept diverse task code without an action enum and never grant execution',()=>{
 for(const code of ['document.querySelector("#confirmed").remove();','document.querySelector("#confirmed").textContent="新内容";','const n=document.createElement("p");n.textContent="提示";document.querySelector("#confirmed").prepend(n);','document.querySelector("#confirmed").setAttribute("placeholder","搜索资料");','const count=document.querySelectorAll("#confirmed > article").length;const n=document.createElement("output");n.textContent=String(count);document.querySelector("#confirmed").prepend(n);']){
  const checked=validateScriptCandidate(candidate(code),envelope());assert.equal(checked.candidate.code,code);assert.deepEqual(checked.review,{binding:'passed',code:'required',scope:'required',effect:'required',runAuthorization:'required'});
 }
});
test('page, requirement, scope and baseline changes invalidate candidates independently',()=>{
 for(const [key,value] of Object.entries({pageRef:'other-page',documentId:'replacement-document',navigationEpoch:2,scopeRevision:9,requirementRevision:4,scopeHash:'changed-scope',baselineHash:'new-manual-draft'})){
  const raw=candidate();raw.binding={...raw.binding,[key]:value};assert.throws(()=>validateScriptCandidate(raw,envelope()),/GENERATION_BINDING_CHANGED/);
 }
});
test('stale approval, invented evidence, undeclared capability and model self-approval fail closed',()=>{
 assert.throws(()=>validateScriptCandidate({...candidate(),decisionId:'other'},envelope()),/GENERATION_APPROVAL_CHANGED/);
 assert.throws(()=>validateScriptCandidate({...candidate(),evidenceRefs:['fabricated']},envelope()),/GENERATION_EVIDENCE_UNKNOWN/);
 assert.throws(()=>validateScriptCandidate({...candidate(),grants:['GM_xmlhttpRequest']},envelope()),/GENERATION_CAPABILITY_DENIED/);
 assert.throws(()=>validateScriptCandidate({...candidate(),passed:true},envelope()),/GENERATION_CONTRACT_INVALID/);
});
test('a valid envelope does not prove locator uniqueness or code confinement',()=>{
 const e=envelope();e.scopes[0].locator='main';assert.equal(validateGenerationEnvelope(e).scopes[0].locator,'main');
 const checked=validateScriptCandidate(candidate('document.body.remove();'),e);assert.equal(checked.review.scope,'required');assert.equal(checked.review.code,'required');
});
test('output-only tasks require a verified output anchor and byte limits apply to Unicode',()=>{
 const e=envelope();e.scopes=[{id:'output',role:'outputAnchor',locator:'#output',evidenceRefs:['read-target']}];assert.equal(validateGenerationEnvelope(e).scopes[0].role,'outputAnchor');
 e.scopes=[e.scopes[0],{...e.scopes[0]}];assert.throws(()=>validateGenerationEnvelope(e));
 const limited=envelope();limited.policy.maxCodeBytes=8;assert.throws(()=>validateScriptCandidate(candidate('中文字'),limited),/GENERATION_CODE_LIMIT/);
 const preservation=envelope();preservation.scopes=[preservation.scopes[1]];assert.throws(()=>validateGenerationEnvelope(preservation),/GENERATION_SCOPE_REQUIRED/);
});
