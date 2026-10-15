import type { PageBinding } from './p2-types';
import type { ChatMessage } from '../service-worker/ai-providers/base';
export interface PageSuggestion { title: string; intent: string; }
export interface AnalysisPreview { thinkingEnabled?:boolean;thinkingProtocol?:'thinking'|'none'; id: string; binding: PageBinding; provider: {model:string;baseUrl:string}; messages: ChatMessage[]; }
export type P7Message = {requestId:string} & (
  | {type:'PREPARE_PAGE_ANALYSIS'}
  | {type:'RUN_PAGE_ANALYSIS'; previewId:string}
  | {type:'CANCEL_PAGE_ANALYSIS'; previewId:string}
);
