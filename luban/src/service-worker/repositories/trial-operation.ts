import type {PageBinding} from '../../shared/p2-types';
export interface TrialOperation {id:string;workspaceId:string;ownerToken:string;workerId:string;draftRevision:number;codeHash:string;binding:PageBinding;state:'executing'|'completed'|'failed'|'unknown'|'reviewed';createdAt:number;updatedAt:number;receiptId?:string;}
