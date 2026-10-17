export type BridgeAction = 'status' | 'connect' | 'disconnect' | 'revoke' | 'check-page-access';
export interface BridgeSnapshot {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  extensionId: string;
  paired: boolean;
  profileId?: string;
  version?: string;
  node?: string;
  platform?: string;
  pageCount: number;
  message?: string;
}
export type BridgeReply = {ok: true; data: BridgeSnapshot} | {ok: false; error: string};
export type LocalTaskState='running'|'cancelRequested'|'completed'|'failed'|'cancelled'|'waitingUser';
export interface LocalTask {id:string;workspaceId:string;workerId:string;source:'sidepanel'|'mcp'|'feishu';kind:string;epoch:number;state:LocalTaskState;seq:number;createdAt:number;updatedAt:number;errorCode?:string;}
export interface UnknownOperation {id:string;workspaceId:string;documentId:string;draftRevision:number;createdAt:number;}
export type LocalTasksReply={ok:true;data:{tasks:LocalTask[];unknownOperations:UnknownOperation[];pruned?:number}}|{ok:false;error:string};
export type PageCapability='context.read'|'tool.read'|'draft.submit'|'trial.request';
export interface PageGrant {id:string;profileId:string;browserSession:string;workerId:string;navigationEpoch:number;binding:import('./p2-types').PageBinding;title:string;createdAt:number;capabilities?:PageCapability[];workspaceId?:string;}
export type PageGrantsReply={ok:true;data:{grants:PageGrant[]}}|{ok:false;error:string};
export interface ExternalCommand {taskId:string;epoch:number;revision:number;source:'mcp'|'feishu';clientId:string;requestKey:string;command:'readContext'|'readTool'|'submitDraft'|'requestTrial';pageRef:string;workspaceId?:string;expectedDraftRevision?:number;candidate?:{code:string;grants:string[];explanation:string};}
export interface ExternalApproval {id:string;kind:'external';task:ExternalCommand;profileId:string;workspaceId:string;grantId:string;browserSession:string;workerId:string;navigationEpoch:number;binding:import('./p2-types').PageBinding;draftRevision:number;codeHash:string;createdAt:number;expiresAt:number;state:'pending'|'executing'|'completed'|'failed'|'rejected'|'expired'|'unknown'|'reviewed';receiptId?:string;}
