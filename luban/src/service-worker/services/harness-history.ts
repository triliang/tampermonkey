import type {ConversationMessage} from '../../shared/v2-types';
// Bound transferred context by bytes as well as message count; original history
// remains untouched in IndexedDB, including attachments and code references.
export function harnessHistory(messages:ConversationMessage[]){
 const result:Array<{role:'user'|'assistant';text:string;createdAt:number}>=[];let remaining=96*1024;
 for(const m of messages.slice(-40).reverse()){const next={role:m.role,text:m.text.slice(0,4000),createdAt:m.createdAt};const bytes=new TextEncoder().encode(JSON.stringify(next)).length;if(bytes>remaining)break;remaining-=bytes;result.unshift(next);}
 return result;
}
