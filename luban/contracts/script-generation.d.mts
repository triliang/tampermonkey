export interface GenerationBinding {pageRef:string;documentId:string;navigationEpoch:number;scopeRevision:number;requirementRevision:number;scopeHash:string;baselineHash:string|null}
export interface GenerationEnvelope {version:1;operationId:string;decisionId:string;binding:GenerationBinding;requirement:{goal:string;constraints:string[];expectedOutcomes:string[]};scopes:Array<{id:string;role:'target'|'preserve'|'outputAnchor';locator:string;evidenceRefs:string[]}>;policy:{allowedGrants:string[];maxCodeBytes:number}}
export interface ScriptCandidate {operationId:string;decisionId:string;binding:GenerationBinding;code:string;grants:string[];explanation:string;evidenceRefs:string[]}
export interface CandidateReview {binding:'passed';code:'required';scope:'required';effect:'required';runAuthorization:'required'}
export function validateGenerationEnvelope(raw:unknown):GenerationEnvelope;
export function validateScriptCandidate(raw:unknown,envelope:GenerationEnvelope):{candidate:ScriptCandidate;review:CandidateReview};
