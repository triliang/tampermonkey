import type { PageBinding } from './p2-types';
import type { GmDelta } from './v2-types';
export interface TrialResult { ok: boolean; timedOut: boolean; error?: string; changes: GmDelta[]; repeated?: boolean; }
export interface TrialReceipt { workflowRevision?:number;targetFingerprint?:string|null;checkerVersion?:string;postTargetFingerprint?:string|null;targetRemovedAfterTrial?:boolean; id: string; workspaceId: string; draftHash: string; draftRevision: number; binding: PageBinding; expiresAt: number; }
export type P3Message = { requestId: string } & (
  | { type: 'TRIAL_DRAFT'; workspaceId: string; expectedDraftRevision: number }
  | { type: 'COMMIT_DRAFT'; workspaceId: string; expectedDraftRevision: number; receiptId: string; name: string; opId: string;effectAcknowledged?:boolean }
  | { type: 'RESTORE_PREVIOUS'; workspaceId: string; expectedDraftRevision: number; expectedRevision: number; discardDraft: boolean; opId: string }
);
