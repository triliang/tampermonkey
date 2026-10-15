import type {CodeReference} from './code-reference';
import type { UserScript } from './types';

export interface ScriptVersion {
  versionId: string;
  hash: string;
  code: string;
  explanation: string;
  grants: string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  createdAt: number;
}
export interface ScriptRecord {
  id: string;
  schemaVersion: 2;
  name: string;
  host: string | null;
  matches: string[];
  needsRuleReview: boolean;
  recordRevision: number;
  current: ScriptVersion;
  previous: ScriptVersion | null;
  autoRun: { desired: boolean; generation: number };
  tombstone: boolean;
  source: UserScript['source'];
  enabled: boolean;
  aiMeta?: UserScript['aiMeta'];
  createdAt: number;
  updatedAt: number;
}
export interface WorkspaceRecord {
  codeReference?:CodeReference|null;
  id: string;
  scriptId: string | null;
  host: string | null;
  baseRevision: number | null;
  draftRevision: number;
  input: string;
  draft: ScriptVersion | null;
  activeRequestId: string | null;
  status: 'idle' | 'generating' | 'interrupted';
  updatedAt: number;
}
export interface ConversationMessage {
  scriptAttachment?:import('./script-attachment').ScriptAttachment;
  reasoning?:import('./reasoning').ReasoningStage[];
  reasoningOmitted?:boolean;
  codeReference?:CodeReference;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}
export interface OperationRecord {
  id: string;
  scriptId: string;
  type: 'update' | 'restore' | 'enable' | 'disable' | 'delete';
  expectedRevision: number;
  candidate?: ScriptVersion;
  phase: 'prepared' | 'recovery_required';
  createdAt: number;
}
export type GmDelta = { op: 'set'; key: string; value: unknown } | { op: 'delete'; key: string };
export interface DraftPatch {
  codeReference?:CodeReference|null;
  input?: string;
  draft?: ScriptVersion | null;
  status?: WorkspaceRecord['status'];
  activeRequestId?: string | null;
}
