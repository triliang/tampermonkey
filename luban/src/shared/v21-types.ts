import type { PageBinding } from './p2-types';
import type { ScriptVersion } from './v2-types';
export interface Diagnostic { code:string; message:string; line?:number; column?:number; severity:'error'|'warning'; }
export interface QualityReport { passed:boolean; checkerVersion:string; diagnostics:Diagnostic[]; repairable:boolean; }
export interface TargetCandidate { selector:string; tag:string; text:string; fingerprint:string; relation:'element'|'ancestor'; }
export interface TargetContext { candidates:TargetCandidate[]; neighbors:string[]; }
export interface Workflow {
  trigger?:'immediate'|'click'|'change'|'delay';expectedEffect?:string;
  clarification?:string;
  revision:number; constraints:string; feedback:string; scope:'page'|'element'|'module'; selectors:string[];
  targetFingerprint:string|null; strategyConfirmed:boolean; binding:PageBinding|null;
  quality?:QualityReport; outcome?:{requestId?:string;requests:number;firstPassed:boolean;repaired:boolean;state:'ready'|'failed'|'cancelled';message?:string};
  failure?:{code:string;grants:string[];diagnostics:Diagnostic[];createdAt:number};
}
export const emptyWorkflow=():Workflow=>({revision:0,constraints:'',feedback:'',scope:'page',selectors:[],targetFingerprint:null,strategyConfirmed:false,binding:null});
export type V21Message={requestId:string}&(
 | {type:'GET_WORKFLOW';workspaceId:string}
 | {type:'UPDATE_WORKFLOW';workspaceId:string;expectedDraftRevision:number;constraints?:string;trigger?:Workflow['trigger'];expectedEffect?:string;feedback?:string;selectors?:string[];scope?:Workflow['scope'];confirmStrategy?:boolean}
 | {type:'CHECK_DRAFT';workspaceId:string;expectedDraftRevision:number}
 | {type:'EDIT_FAILURE';workspaceId:string;expectedDraftRevision:number}
 | {type:'V21_PREVIEW_TARGET';selectors:string[];fingerprint:string}
 | {type:'V21_CLEAR_PREVIEW'}
);
export interface WorkflowRecord {id:string;workspaceId:string;workflow:Workflow;}
export interface FailedCandidate {version:ScriptVersion;quality:QualityReport;}
