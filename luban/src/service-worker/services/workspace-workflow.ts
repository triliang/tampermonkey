import {workspaceLocked} from './workspace-lock';
import {emptyWorkflow} from '../../shared/v21-types';
import type {Workflow,WorkflowRecord,V21Message} from '../../shared/v21-types';
import type {ScriptStore} from '../script-store';
import type {CapturedPage} from '../../shared/p2-types';
import {DataError} from '../repositories/database';
import {inspectCode} from './code-quality';
export const getWorkflow=async(store:ScriptStore,id:string):Promise<Workflow>=>{await store.ready();return(await store.db.get<WorkflowRecord>('meta','v21:workflow:'+id))?.workflow??emptyWorkflow();};
export async function workflowCommand(store:ScriptStore,msg:Extract<V21Message,{workspaceId:string}>,capture:(s?:string[])=>Promise<CapturedPage>){
 const ws=await store.workspaces.get(msg.workspaceId);if(!ws)throw new DataError('WORKSPACE_MISSING','工作区不存在。');
 const workflow=await getWorkflow(store,ws.id);if(msg.type==='GET_WORKFLOW')return workflow;
 if(workspaceLocked(ws.id)||ws.status==='generating')throw new DataError('GENERATION_BUSY','请先取消或等待生成。');
 if(ws.draftRevision!==msg.expectedDraftRevision)throw new DataError('REVISION_CONFLICT','工作区已变化，请重载。');
 if(msg.type==='CHECK_DRAFT'){if(!ws.draft)throw new DataError('DRAFT_MISSING','没有待检查草稿。');return inspectCode(ws.draft.code,ws.draft.grants);}
 if(msg.type==='EDIT_FAILURE'){
  if(!workflow.failure)throw new DataError('FAILURE_MISSING','没有失败候选。');
  const draft={versionId:crypto.randomUUID(),hash:'unverified-edit',code:workflow.failure.code,grants:workflow.failure.grants,explanation:'失败候选已复制为草稿，请检查并重新试运行。',runAt:'document_end' as const,createdAt:Date.now()};
  workflow.revision++;delete workflow.quality;return store.workspaces.saveDraft(ws.id,ws.draftRevision,{draft},[],workflow);
 }
 if(msg.type!=='UPDATE_WORKFLOW')throw new DataError('INVALID_MESSAGE','无效工作流消息。');
 if(msg.trigger!==undefined){if(!['immediate','click','change','delay'].includes(msg.trigger))throw new DataError('INVALID_TRIGGER','触发方式无效。');workflow.trigger=msg.trigger;workflow.strategyConfirmed=false;}
 if(msg.expectedEffect!==undefined){if(typeof msg.expectedEffect!=='string'||msg.expectedEffect.length>1000)throw new DataError('INVALID_INPUT','预期效果过长。');workflow.expectedEffect=msg.expectedEffect;workflow.strategyConfirmed=false;}
 if(msg.constraints!==undefined){if(typeof msg.constraints!=='string'||msg.constraints.length>3000)throw new DataError('INVALID_INPUT','约束过长。');workflow.constraints=msg.constraints;workflow.strategyConfirmed=false;}
 if(msg.feedback!==undefined){if(typeof msg.feedback!=='string'||msg.feedback.length>3000)throw new DataError('INVALID_INPUT','反馈过长。');workflow.feedback=msg.feedback;}
 if(msg.scope!==undefined){if(!['page','element','module'].includes(msg.scope))throw new DataError('INVALID_SCOPE','目标范围无效。');workflow.scope=msg.scope;workflow.strategyConfirmed=false;}
 if(msg.selectors!==undefined){
  if(!Array.isArray(msg.selectors)||msg.selectors.length>4||msg.selectors.some(x=>typeof x!=='string'||x.length>1000))throw new DataError('INVALID_SELECTION','点选信息无效。');
  const page=await capture(msg.selectors);if(page.binding.host!==ws.host)throw new DataError('WRONG_PAGE','当前网站不匹配。');
  const candidate=page.context.target?.targetContext?.candidates[0];
  if(msg.selectors.length&&!candidate)throw new DataError('TARGET_STALE','目标无法确认，请重新点选。');
  workflow.selectors=msg.selectors;workflow.targetFingerprint=candidate?.fingerprint??null;workflow.binding=page.binding;workflow.strategyConfirmed=false;
 }
 if(msg.confirmStrategy){if(workflow.scope==='module'&&!workflow.targetFingerprint)throw new DataError('TARGET_REQUIRED','请先确认目标范围。');workflow.strategyConfirmed=true;}
 workflow.revision++;delete workflow.quality;
 const messages=msg.feedback?[{role:'user' as const,text:'效果反馈：'+msg.feedback,createdAt:Date.now()}]:[];
 const workspace=await store.workspaces.saveDraft(ws.id,ws.draftRevision,msg.feedback!==undefined?{input:msg.feedback}:{},messages,workflow);
 return{workspace,workflow};
}
