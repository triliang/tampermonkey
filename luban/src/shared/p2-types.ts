import type { PageContext } from './types';
import type { ChatMessage } from '../service-worker/ai-providers/base';

export interface PageBinding { tabId: number; documentId: string; host: string; url: string; }
export interface CapturedPage { context: PageContext; binding: PageBinding; }
export interface GenerationEnvelope {
  scriptAttachment?:import('./script-attachment').ScriptAttachment;
  thinkingEnabled?:boolean;
  thinkingProtocol?:'thinking'|'none';
  repairAllowed?:boolean;
  workflow?:import('./v21-types').Workflow;
  workflowRevision?:number;
  id: string;
  workspaceId: string;
  draftRevision: number;
  binding: PageBinding;
  createdAt: number;
  provider: { model: string; baseUrl: string };
  messages: ChatMessage[];
  retryMessages: ChatMessage[];
  estimatedInputTokens: number;
  historyRemoved: number;
}
export type P2Message = { requestId: string } & (
  | { type: 'GET_CURRENT_SITE' }
  | { type: 'GET_SCRIPT_RECORD'; scriptId: string }
  | { type: 'PREPARE_GENERATION'; workspaceId: string; expectedDraftRevision: number; selectors?: string[];repairAllowed?:boolean }
  | { type: 'GENERATE_WORKSPACE'; workspaceId: string; envelopeId: string }
  | { type: 'CANCEL_WORKSPACE_GENERATION'; workspaceId: string }
  | { type: 'P2_CAPTURE'; selectors?: string[] }
  | { type: 'CAPTURE_REPORT'; context: PageContext }
);
