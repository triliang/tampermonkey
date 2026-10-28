import {existsSync} from 'node:fs';
const source=new URL('../../contracts/conversation-intent.mjs',import.meta.url);
const packaged=new URL('../contracts/conversation-intent.mjs',import.meta.url);
export const {chatDecision,wantsDraft,bareActionQuestion,completeBareAction,preservesPage,greetingReply,actionChoice,resolveActionChoice,requestsPageChange,retainsGenerationRequest}=await import(existsSync(packaged)?packaged:source);
