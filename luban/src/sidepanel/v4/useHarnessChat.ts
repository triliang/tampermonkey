import {harnessErrorMessage} from '../../shared/harness-errors';
import {useEffect,useRef,useState} from 'preact/hooks';
import type {V4Conversation} from '../../shared/v4-types';
import type {ConversationMessage,WorkspaceRecord} from '../../shared/v2-types';
interface Options {enabled:boolean;workspaceId:string|null;ensureWorkspace:()=>Promise<WorkspaceRecord>;onArtifact:(id:string)=>Promise<void>;onHistory?:(messages:ConversationMessage[])=>void;}
export function useHarnessChat(options:Options){
 const latest=useRef(options);latest.current=options;
 const [conversation,setConversation]=useState<V4Conversation|null>(null),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const current=useRef<V4Conversation|null>(null),scope=useRef(options.workspaceId),epoch=useRef(0),locked=useRef(false),polling=useRef(false);
 if(scope.current!==options.workspaceId){scope.current=options.workspaceId;epoch.current++;current.current=null;}
 async function rpc<T>(method:string,params:Record<string,unknown>={}):Promise<T>{const r=await chrome.runtime.sendMessage({type:'V4_HARNESS',method,params});if(!r?.ok)throw Error(typeof r?.error==='string'?r.error:r?.error?.message??'对话请求失败。');return r.data as T;}
 function accept(c:V4Conversation,workspaceId:string){if(scope.current!==workspaceId)return;if(current.current?.id===c.id&&(current.current.sequence??0)>(c.sequence??0))return;current.current=c;setConversation(c);if(c.workspaceMessages)latest.current.onHistory?.(c.workspaceMessages);}
 useEffect(()=>{setConversation(null);setError('');setNotice('');const workspaceId=options.workspaceId;if(!options.enabled||!workspaceId)return;let cancelled=false;void rpc<V4Conversation>('open',{workspaceId}).then(c=>{if(!cancelled)accept(c,workspaceId);}).catch(()=>{/* Reading old local history must work without a connected Bridge. */});return()=>{cancelled=true;};},[options.workspaceId,options.enabled]);
 useEffect(()=>{if(!options.enabled)return;const timer=setInterval(()=>{const c=current.current;if(!c||polling.current||locked.current)return;const generation=epoch.current;polling.current=true;void rpc<V4Conversation>('get',{conversationId:c.id}).then(next=>{if(generation===epoch.current)accept(next,c.workspaceId);}).catch(async e=>{if(generation!==epoch.current)return;if(e.message==='HARNESS_CONVERSATION_MISSING'){try{const next=await rpc<V4Conversation>('open',{workspaceId:c.workspaceId});if(generation===epoch.current){accept(next,c.workspaceId);setError('');setNotice('已恢复当前工作区会话；页面目标与生成授权请重新核对。');}}catch(recovery){if(generation===epoch.current)setError(harnessErrorMessage(recovery instanceof Error?recovery.message:'会话恢复失败。'));}}else setError(harnessErrorMessage(e.message));}).finally(()=>{polling.current=false;});},1500);return()=>clearInterval(timer);},[options.enabled]);
 useEffect(()=>()=>{epoch.current++;},[]);
 async function ensure(){const requested=latest.current.workspaceId;const ws=await latest.current.ensureWorkspace();if((requested!==null&&latest.current.workspaceId!==requested)||(latest.current.workspaceId!==null&&latest.current.workspaceId!==ws.id))throw Error('会话已切换，请在当前会话继续。');if(scope.current!==ws.id){scope.current=ws.id;epoch.current++;current.current=null;}const c=await rpc<V4Conversation>('open',{workspaceId:ws.id});if(scope.current!==ws.id)throw Error('会话已切换，请在当前会话继续。');accept(c,ws.id);return c;}
 async function act(method:string,extra:Record<string,unknown>={}){if(locked.current)return false;locked.current=true;setWorking(true);setError('');setNotice('');let generation=epoch.current;try{
  const prior=current.current;const c=await ensure();generation=epoch.current;
  if(prior&&prior.workspaceId===c.workspaceId&&prior.id!==c.id){setNotice('已恢复当前工作区会话；页面目标与生成授权请重新核对。');if(!['message','scan','clear'].includes(method))throw Error('HARNESS_CONFIRMATION_RESET');}
  if(['message','generate','resume'].includes(method))await rpc('configure',{conversationId:c.id});
  if(generation!==epoch.current||scope.current!==c.workspaceId)return false;
  if(method==='manual')setNotice('请在网页中点选区域，Esc 可取消。');
  const data=await rpc<unknown>(method,{conversationId:c.id,requestKey:crypto.randomUUID(),expectedRevision:c.revision,...extra});
  if(generation!==epoch.current)return false;
  if(data&&typeof data==='object'&&'id' in data)accept(data as V4Conversation,c.workspaceId);
  if(method==='submit'){accept({...c,submitted:true},c.workspaceId);await latest.current.onArtifact(c.workspaceId);}
  if(method==='show')setNotice(c.selected.length?`已标注所选 ${c.selected.length} 处范围，未选结构节点不显示。`:'尚未选定目标，页面标注已清除；请先根据需求分析目标。');if(method==='clear')setNotice('标注已关闭，目标选择保留。');
  return true;
 }catch(e){if(generation===epoch.current){if(e instanceof Error&&e.message==='HARNESS_CONVERSATION_MISSING'){current.current=null;setConversation(null);}setError(e instanceof Error?harnessErrorMessage(e.message):'操作失败。');}return false;}finally{locked.current=false;setWorking(false);}}
 const c=conversation?.workspaceId===options.workspaceId?conversation:null;
 const active=!!c&&['running','generating','stopping'].includes(c.status);
 return {conversation:c,working,active,busy:working||active,error,notice,act,send:(text:string)=>act('message',{text}),cancel:()=>act('cancel')};
}
export type HarnessController=ReturnType<typeof useHarnessChat>;
export function conversationTimeline(legacy:ConversationMessage[],c:V4Conversation|null):ConversationMessage[]{
 const persisted=new Set(legacy.map(m=>m.agentMessageId).filter(Boolean));
 const added=(c?.messages.slice(c.historyCount??0)??[]).filter(m=>!m.id||!persisted.has(c!.id+':'+m.id)).map((m,i)=>({...m,createdAt:m.createdAt??((legacy[0]?.createdAt??0)+i+1)}));
 return [...legacy,...added].sort((a,b)=>a.createdAt-b.createdAt);
}
