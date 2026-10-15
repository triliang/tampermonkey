export interface RuntimeStatus { id: string; state: 'ready'|'disabled'|'unavailable'|'cleanup_required'|'error'; message: string; registeredVersionId?: string; updatedAt: number; }
export interface AutoRequest { kind: 'start'|'delta'|'result'; requestId: string; scriptId: string; versionId: string; hash: string; generation: number; leaseId?: string; seq?: number; op?: 'set'|'delete'; key?: string; value?: unknown; error?: string; }
export type P4Message = {requestId:string} & (
  | {type:'SET_AUTO_RUN';scriptId:string;expectedRevision:number;enabled:boolean}
  | {type:'RETRY_AUTO_RUN'}
  | {type:'LIST_RUNTIME_STATUS'}
  | {type:'GET_AUTO_DIAGNOSTICS';scriptId:string}
  | {type:'GET_RUNTIME_STATUS';scriptId:string}
  | {type:'AUTO_BRIDGE';payload:AutoRequest}
);
