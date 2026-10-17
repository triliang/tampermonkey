import {z} from 'zod';
import {protocolError} from './protocol.mjs';

const identity={toolRef:z.string().uuid(),requestKey:z.string().min(1).max(128)};
export const toolRead=z.object(identity).strict();
export const toolDraft=z.object({...identity,expectedDraftRevision:z.number().int().nonnegative(),candidate:z.object({code:z.string().max(256*1024).refine(value=>Buffer.byteLength(value)<=256*1024),grants:z.array(z.string().max(64)).max(16),explanation:z.string().max(4000)}).strict()}).strict();
export const toolTrial=z.object({...identity,draftRevision:z.number().int().nonnegative(),pageRef:z.string().uuid()}).strict();

export function publicPages(profiles,profileId){
  return profiles.pages(profileId).map(({pageRef,title,url,capabilities,toolRef})=>({pageRef,title,url,capabilities,...(toolRef?{toolRefs:[toolRef]}:{})}));
}
export class ToolService{
  constructor(profiles,coordinator){this.profiles=profiles;this.coordinator=coordinator;}
  resolve(principal,toolRef){
    const page=this.profiles.pages(principal.profileId).find(page=>page.toolRef===toolRef&&page.workspaceId&&page.capabilities.includes('tool.read'));
    if(!page)throw protocolError('TOOL_NOT_GRANTED');
    return page;
  }
  call(principal,method,raw){
    const params=({read:toolRead,submit:toolDraft,trial:toolTrial}[method]).parse(raw);
    const page=this.resolve(principal,params.toolRef);
    if(method==='trial'&&params.pageRef!==page.pageRef)throw protocolError('PAGE_NOT_GRANTED');
    const command=method==='read'?'readTool':method==='submit'?'submitDraft':'requestTrial';
    return this.coordinator.submit(principal,{requestKey:params.requestKey,command,pageRef:page.pageRef,workspaceId:page.workspaceId,expectedDraftRevision:params.expectedDraftRevision??params.draftRevision??0,...(params.candidate?{candidate:params.candidate}:{})});
  }
}
