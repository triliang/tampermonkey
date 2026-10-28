export interface PlanIR {planHash:string;action:'hide'|'dim';targetIds:string[]}
export interface PlanEnvelope {planHash:string;action:'hide'|'dim';targets:Array<{id:string;selector:string}>}
export interface UserscriptMetadata {name:string;namespace:string;version:string;description:string;matches:string[];runAt:'document-start'|'document-end'|'document-idle';grants:string[]}
export function validatePlan(raw:unknown,envelope:PlanEnvelope):PlanIR;
export function validateSelector(selector:string):string;
export function compilePlan(raw:unknown,envelope:PlanEnvelope):{code:string;grants:string[];explanation:string;plan:PlanIR};
export function serializeUserscript(body:string,metadata:UserscriptMetadata):string;
export function parseUserscript(content:string):{metadata:UserscriptMetadata;body:string};
