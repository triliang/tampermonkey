// Contract for the proposed generic generation lane. Not an execution sandbox.
// Envelopes come from the host's verified evidence and approval ledger, never the model.
const fail=code=>{throw Error(code);};
const object=(value,keys)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('GENERATION_CONTRACT_INVALID');
 return value;
};
const string=(value,max=1000)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))fail('GENERATION_CONTRACT_INVALID');
 return value;
};
const strings=(value,max,allowEmpty=false)=>{
 if(!Array.isArray(value)||value.length>max||(!allowEmpty&&!value.length))fail('GENERATION_CONTRACT_INVALID');
 return value.map(v=>string(v));
};
const revision=value=>{if(!Number.isSafeInteger(value)||value<0)fail('GENERATION_CONTRACT_INVALID');return value;};
const unique=value=>{if(new Set(value).size!==value.length)fail('GENERATION_CONTRACT_INVALID');return value;};
const bindingKeys=['pageRef','documentId','navigationEpoch','scopeRevision','requirementRevision','scopeHash','baselineHash'];
function binding(raw){
 object(raw,bindingKeys);
 return {pageRef:string(raw.pageRef),documentId:string(raw.documentId),navigationEpoch:revision(raw.navigationEpoch),scopeRevision:revision(raw.scopeRevision),requirementRevision:revision(raw.requirementRevision),scopeHash:string(raw.scopeHash),baselineHash:raw.baselineHash===null?null:string(raw.baselineHash)};
}
export function validateGenerationEnvelope(raw){
 object(raw,['version','operationId','decisionId','binding','requirement','scopes','policy']);
 if(raw.version!==1)fail('GENERATION_CONTRACT_VERSION');
 const requirement=object(raw.requirement,['goal','constraints','expectedOutcomes']);
 const policy=object(raw.policy,['allowedGrants','maxCodeBytes']);
 if(!Number.isSafeInteger(policy.maxCodeBytes)||policy.maxCodeBytes<1||policy.maxCodeBytes>250000)fail('GENERATION_CONTRACT_INVALID');
 if(!Array.isArray(raw.scopes)||!raw.scopes.length||raw.scopes.length>40)fail('GENERATION_CONTRACT_INVALID');
 const scopes=raw.scopes.map(scope=>{
  object(scope,['id','role','locator','evidenceRefs']);
  if(!['target','preserve','outputAnchor'].includes(scope.role))fail('GENERATION_CONTRACT_INVALID');
  return {id:string(scope.id),role:scope.role,locator:string(scope.locator,1000),evidenceRefs:unique(strings(scope.evidenceRefs,20))};
 });
 unique(scopes.map(s=>s.id));
 if(!scopes.some(s=>s.role==='target'||s.role==='outputAnchor'))fail('GENERATION_SCOPE_REQUIRED');
 return {version:1,operationId:string(raw.operationId),decisionId:string(raw.decisionId),binding:binding(raw.binding),requirement:{goal:string(requirement.goal,4000),constraints:strings(requirement.constraints,20,true),expectedOutcomes:strings(requirement.expectedOutcomes,20)},scopes,policy:{allowedGrants:unique(strings(policy.allowedGrants,16,true)),maxCodeBytes:policy.maxCodeBytes}};
}
export function validateScriptCandidate(raw,hostEnvelope){
 const envelope=validateGenerationEnvelope(hostEnvelope);
 object(raw,['operationId','decisionId','binding','code','grants','explanation','evidenceRefs']);
 if(raw.operationId!==envelope.operationId||raw.decisionId!==envelope.decisionId)fail('GENERATION_APPROVAL_CHANGED');
 const candidateBinding=binding(raw.binding);
 if(bindingKeys.some(key=>candidateBinding[key]!==envelope.binding[key]))fail('GENERATION_BINDING_CHANGED');
 const code=string(raw.code,envelope.policy.maxCodeBytes);
 if(new TextEncoder().encode(code).length>envelope.policy.maxCodeBytes)fail('GENERATION_CODE_LIMIT');
 const grants=unique(strings(raw.grants,16,true));
 if(grants.some(grant=>!envelope.policy.allowedGrants.includes(grant)))fail('GENERATION_CAPABILITY_DENIED');
 const knownRefs=new Set(envelope.scopes.flatMap(scope=>scope.evidenceRefs));
 const evidenceRefs=unique(strings(raw.evidenceRefs,40));
 if(evidenceRefs.some(ref=>!knownRefs.has(ref)))fail('GENERATION_EVIDENCE_UNKNOWN');
 // A model can cite valid evidence and still produce unsafe or incorrect code.
 // Binding validation must never be presented as scope confinement or run permission.
 return {candidate:{operationId:raw.operationId,decisionId:raw.decisionId,binding:candidateBinding,code,grants,explanation:string(raw.explanation,4000),evidenceRefs},review:{binding:'passed',code:'required',scope:'required',effect:'required',runAuthorization:'required'}};
}
