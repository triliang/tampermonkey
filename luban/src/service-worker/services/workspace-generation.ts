import {scriptFilename} from '../../shared/script-attachment';
import type {ReasoningStage} from '../../shared/reasoning';
import {thinkingProtocol} from '../../shared/thinking';
import {createReference,versionHash,validReference} from '../../shared/code-reference';
import {lockWorkspace,workspaceLocked,type WorkspaceRelease} from './workspace-lock';
import {inspectCode,safeRepair} from './code-quality';
import {getWorkflow} from './workspace-workflow';
import type {Workflow} from '../../shared/v21-types';
import {estimateTokens} from '../prompt-builder';
import {TOKEN_BUDGET} from '../../shared/constants';
import type { CapturedPage, GenerationEnvelope } from '../../shared/p2-types';
import type { ProviderConfig, GenerationResult } from '../../shared/types';
import type { ScriptVersion, WorkspaceRecord } from '../../shared/v2-types';
import type { ChatMessage } from '../ai-providers/base';
import type { ScriptStore } from '../script-store';
import { prepareEnvelope } from './generation-envelope';
import { byteSize,DataError } from '../repositories/database';
import { parseAiResponse } from '../prompt-builder';
import { scanCode } from '../safety-scanner';

export interface GenerationTransport {
  waitForStop?():Promise<void>;
  tracksRequests?:boolean;
  cancel(): void;
  generate(config: ProviderConfig, messages: ChatMessage[], options: { jsonMode: boolean; thinking: boolean;autoRetry?:boolean }, callbacks: { onDelta: (s: string) => void;onRequest?:()=>void;onThinking?:()=>void;onReasoning?:(text:string,truncated:boolean)=>void }): Promise<{ text: string;reasoning?:string;reasoningTruncated?:boolean; finishReason?:string;malformed?:boolean;streamEnd?:'eof'|'done';usage?: { total_tokens?: number } }>;
}
interface Session { release:WorkspaceRelease;requestId: string; client: GenerationTransport; cancelled: boolean; started: Promise<WorkspaceRecord>; }
export class WorkspaceGeneration {
  private envelopes = new Map<string, GenerationEnvelope>();
  private sessions = new Map<string, Session>();
  constructor(private store: ScriptStore, private capture: (selectors?: string[]) => Promise<CapturedPage>,
    private configuration: () => Promise<ProviderConfig>, private clientFactory: (workspaceId?:string) => GenerationTransport) {}
  async prepare(workspaceId: string, expectedRevision: number, selectors?: string[], repairAllowed=true): Promise<GenerationEnvelope> {
    const ws = await this.store.workspaces.get(workspaceId);
    if (!ws || ws.draftRevision !== expectedRevision) throw new DataError('REVISION_CONFLICT', '工作区已变化，请重载后重新预览请求。');
    if (ws.status === 'generating') throw new DataError('GENERATION_BUSY', '当前工作区正在生成。');
    const workflow=await getWorkflow(this.store,workspaceId);
    const chosen=workflow.selectors.length?workflow.selectors:selectors;
    const page = await this.capture(chosen);
    if(workflow.targetFingerprint&&workflow.binding&&(workflow.binding.documentId!==page.binding.documentId||workflow.binding.tabId!==page.binding.tabId||workflow.binding.url!==page.binding.url))throw new DataError('TARGET_STALE','页面已重新加载，请重新点选目标。');
    if(workflow.targetFingerprint&&page.context.target?.targetContext?.candidates[0]?.fingerprint!==workflow.targetFingerprint)throw new DataError('TARGET_STALE','目标已变化，请重新点选。');
    if((workflow.scope==='module'||(workflow.trigger&&workflow.trigger!=='immediate'))&&!workflow.strategyConfirmed)throw new DataError('STRATEGY_REQUIRED','请先确认完整模块策略。');
    if (!ws.host || page.binding.host !== ws.host) throw new DataError('WRONG_PAGE', '当前网站与工具不匹配，请切回适用网站。');
    const record = ws.scriptId ? await this.store.record(ws.scriptId) : undefined;
    const baseline=ws.draft??record?.current??null;
    if(ws.codeReference){
      if(!baseline||!validReference(ws.codeReference,ws.id)||ws.codeReference.versionId!==baseline.versionId||ws.codeReference.hash!==await versionHash(baseline))throw new DataError('REFERENCE_STALE','引用来自旧版本，请移除后从当前脚本重新选行。');
      const verified=await createReference(ws.id,baseline,ws.codeReference.name,ws.codeReference.lines);
      if(verified.text!==ws.codeReference.text)throw new DataError('INVALID_REFERENCE','引用与当前代码不一致，请重新选择。');
    }
    const scriptAttachment=baseline?{workspaceId:ws.id,scriptId:ws.scriptId,versionId:baseline.versionId,hash:await versionHash(baseline),filename:scriptFilename(record?.name??'当前草稿'),source:ws.draft?'draft' as const:'saved' as const}:undefined;
    const config = await this.configuration();
    const envelope = prepareEnvelope({ workspaceId, draftRevision: expectedRevision, captured: page, intent: ws.input,
      workflowContext:{scriptAttachment,codeReference:ws.codeReference,scope:workflow.scope,trigger:workflow.trigger??'immediate',expectedEffect:workflow.expectedEffect,constraints:workflow.constraints,feedback:workflow.feedback,target:page.context.target?.targetContext}, current: ws.draft ?? record?.current ?? null, history: await this.store.workspaces.conversation(workspaceId),
      provider: { model: config.model, baseUrl: config.baseUrl } });
    envelope.scriptAttachment=scriptAttachment;
    envelope.repairAllowed=repairAllowed;envelope.workflowRevision=workflow.revision;envelope.workflow=workflow;
    for (const [id, e] of this.envelopes) if (Date.now() - e.createdAt > 5*60_000) this.envelopes.delete(id);
    if (this.envelopes.size >= 50) throw new DataError('TOO_MANY_PREVIEWS', '请求预览过多，请完成或重新打开工作区。');
    envelope.thinkingEnabled=config.thinkingEnabled!==false;envelope.thinkingProtocol=thinkingProtocol(config);
    this.envelopes.set(envelope.id, envelope);
    return structuredClone(envelope);
  }
  async generate(workspaceId: string, envelopeId: string, requestId: string, onDelta: (s: string) => void, connectionClosed: () => boolean = () => false,onReasoning?:(stage:ReasoningStage)=>void): Promise<{ workspace: WorkspaceRecord; result: GenerationResult }> {
    if (workspaceLocked(workspaceId)||this.sessions.has(workspaceId)) throw new DataError('GENERATION_BUSY', '当前工作区已有请求。');
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope || envelope.workspaceId !== workspaceId || Date.now() - envelope.createdAt > 5*60_000) throw new DataError('PREVIEW_EXPIRED', '请求预览已失效，请重新查看发送内容。');
    const currentPage = await this.capture(envelope.workflow?.selectors);
    if (currentPage.binding.tabId !== envelope.binding.tabId || currentPage.binding.documentId !== envelope.binding.documentId
      || currentPage.binding.url !== envelope.binding.url) throw new DataError('PAGE_CHANGED', '页面已变化，请重新采集并查看发送内容。');
    const config = await this.configuration();
    if (connectionClosed()) throw new DataError('CANCELLED', '生成连接已关闭。');
    if (config.model !== envelope.provider.model || config.baseUrl !== envelope.provider.baseUrl||(config.thinkingEnabled!==false)!==envelope.thinkingEnabled||thinkingProtocol(config)!==envelope.thinkingProtocol) throw new DataError('SETTINGS_CHANGED', '模型设置已变化，请重新预览请求。');
    if (workspaceLocked(workspaceId)||this.sessions.has(workspaceId)) throw new DataError('GENERATION_BUSY', '当前工作区已有请求。');
    const ws = await this.store.workspaces.get(workspaceId);
    if (!ws || ws.draftRevision !== envelope.draftRevision) throw new DataError('REVISION_CONFLICT', '草稿已经变化，请重新预览请求。');
    if (workspaceLocked(workspaceId)||this.sessions.has(workspaceId)) throw new DataError('GENERATION_BUSY', '当前工作区已有请求。');
    this.envelopes.delete(envelopeId);
    const client=this.clientFactory(workspaceId);
    const workflow:Workflow=envelope.workflow??await getWorkflow(this.store,workspaceId);
    const release=await lockWorkspace(workspaceId,this.store.db,'generate');
    const session: Session = {release, requestId, cancelled: false, client, started: this.store.workspaces.saveDraft(workspaceId, envelope.draftRevision,
      { status: 'generating', activeRequestId: requestId }, [{ role: 'user', text: ws.input, createdAt: Date.now(),...(ws.codeReference?{codeReference:ws.codeReference}:{}),...(envelope.scriptAttachment?{scriptAttachment:envelope.scriptAttachment}:{}) }],undefined,release.owner) };
    this.sessions.set(workspaceId, session);
    let started: WorkspaceRecord | undefined;let completed=false;
    let requests=0,firstPassed=false,repaired=false;const reasoning:ReasoningStage[]=[];
    const assertContext=async()=>{const live=await getWorkflow(this.store,workspaceId);if(live.revision!==workflow.revision)throw new DataError('REVISION_CONFLICT','目标策略已变化。');const c=await this.configuration();if(c.model!==config.model||c.baseUrl!==config.baseUrl||c.apiKey!==config.apiKey||c.timeoutMs!==config.timeoutMs||(c.thinkingEnabled!==false)!==(config.thinkingEnabled!==false)||thinkingProtocol(c)!==thinkingProtocol(config))throw new DataError('SETTINGS_CHANGED','模型配置已变化，原草稿保留。');const page=await this.capture(workflow.selectors);if(page.binding.tabId!==envelope.binding.tabId||page.binding.documentId!==envelope.binding.documentId||page.binding.url!==envelope.binding.url)throw new DataError('PAGE_CHANGED','页面已变化，原草稿保留。');if(workflow.targetFingerprint&&page.context.target?.targetContext?.candidates[0]?.fingerprint!==workflow.targetFingerprint)throw new DataError('TARGET_STALE','目标已变化，请重新点选。');};
    const assertLive = () => { if (session.cancelled || connectionClosed()) throw new DataError('CANCELLED', '生成已取消，原草稿保留。'); };
    try {
      started = await session.started; assertLive();delete workflow.quality;delete workflow.failure;delete workflow.clarification;
      let tokens = 0;
      let parsed: ReturnType<typeof parseAiResponse> = {ok:false};
      let nextMessages=envelope.messages;
      for(let attempt=0;attempt<(envelope.repairAllowed===false?1:2);attempt++){
        assertLive();await assertContext();assertLive();
        if(estimateTokens(JSON.stringify(nextMessages))>TOKEN_BUDGET.total-TOKEN_BUDGET.response)throw new DataError('CONTEXT_TOO_LARGE','修复材料超过预算，请缩小任务；原草稿保留。');
        if(!session.client.tracksRequests)requests++;if(attempt)onDelta('正在修复基础问题（1/1），原草稿与保存版保留。');
        const output=await session.client.generate(config,structuredClone(nextMessages),{jsonMode:true,thinking:envelope.thinkingEnabled!==false,autoRetry:false},{onReasoning:(text,truncated)=>{if(!session.cancelled){const stage={attempt:attempt+1,text,truncated};reasoning[attempt]=stage;onReasoning?.(stage);}},onThinking:()=>{if(!session.cancelled)onDelta(attempt?'正在修复基础问题（推理中，1/1）':'模型正在推理…');},onRequest:()=>{if(session.client.tracksRequests)requests++;},onDelta:s=>{if(!session.cancelled)onDelta(s);}});
        if(output.reasoning){reasoning[attempt]={attempt:attempt+1,text:output.reasoning,truncated:!!output.reasoningTruncated};}
        assertLive();tokens+=output.usage?.total_tokens??0;
        if(output.finishReason==='length')throw new DataError('OUTPUT_TRUNCATED','模型结果达到输出上限，未写入草稿，请缩小任务后重新生成。');
        if(output.finishReason&& !['stop'].includes(output.finishReason))throw new DataError('OUTPUT_RESTRICTED','模型未正常完成，原草稿保留。');
        if(output.malformed)throw new DataError('OUTPUT_INCOMPLETE','模型数据流不完整，原草稿保留。');
        const previousParsed=parsed;parsed=parseAiResponse(output.text);
        if(!parsed.ok){if(attempt===0&&envelope.repairAllowed!==false){nextMessages=envelope.retryMessages;continue;}throw new DataError('MODEL_BAD_JSON','模型结果不完整，原草稿保留。');}
        if(parsed.data.needsClarification){workflow.clarification=parsed.data.needsClarification.question;throw new DataError('CLARIFICATION_REQUIRED',workflow.clarification+' 请补充需求或重新点选，原草稿保留。');}
        const quality=inspectCode(parsed.data.code,parsed.data.gmGrants);workflow.quality=quality;
        if(attempt===0)firstPassed=quality.passed;
        if(!quality.passed){
          if(new TextEncoder().encode(parsed.data.code).length<=this.store.db.limits.codeBytes)workflow.failure={code:parsed.data.code,grants:parsed.data.gmGrants,diagnostics:quality.diagnostics,createdAt:Date.now()};
          const d=quality.diagnostics.find(d=>d.severity==='error')!;
          if(attempt===0&&quality.repairable&&envelope.repairAllowed!==false){nextMessages=[...envelope.messages,{role:'assistant',content:JSON.stringify(parsed.data)},{role:'user',content:'仅修正以下基础错误，保持其他代码、权限、目标和触发条件不变。返回原格式的完整 JSON：'+JSON.stringify(quality.diagnostics)}];continue;}
          throw new DataError(d.code,d.message+(d.line?`（第 ${d.line} 行）`:'')+' 原草稿保留，可查看失败候选。');
        }
        if(attempt&&previousParsed.ok&&!safeRepair(previousParsed.data.code,parsed.data.code,previousParsed.data.gmGrants,parsed.data.gmGrants)){
          workflow.failure={code:parsed.data.code,grants:parsed.data.gmGrants,diagnostics:[{code:'REPAIR_SCOPE_CHANGED',message:'修复涉及无法确认的代码变化，请查看候选并确认后重新试运行。',severity:'warning'}],createdAt:Date.now()};
          throw new DataError('REPAIR_SCOPE_CHANGED','修复范围无法自动确认，原草稿保留。请查看并显式编辑候选后试运行。');
        }
        repaired=attempt>0;break;
      }
      if(!parsed.ok)throw new DataError('MODEL_BAD_JSON','模型返回不完整。');
      await assertContext();assertLive();
      const report=scanCode(parsed.data.code,parsed.data.gmGrants);
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ code: parsed.data.code, grants: [...parsed.data.gmGrants].sort(), runAt: 'document_end' })));
      const draft: ScriptVersion = { versionId: crypto.randomUUID(), hash: [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join(''),
        code: parsed.data.code, grants: parsed.data.gmGrants, explanation: parsed.data.explanation, runAt: 'document_end', createdAt: Date.now() };
      assertLive();
      const live = await this.store.workspaces.get(workspaceId);
      if (live?.activeRequestId !== requestId || live.draftRevision !== started.draftRevision) throw new DataError('STALE_GENERATION', '草稿已变化，已丢弃迟到结果。');
      workflow.outcome={requestId,requests,firstPassed,repaired,state:'ready'};delete workflow.failure;
      const assistant={role:'assistant' as const,text:(repaired?'已修复基础问题。':'')+parsed.data.explanation,createdAt:Date.now(),...(reasoning.length?{reasoning:reasoning.filter(Boolean)}:{})};
      if(byteSize({id:workspaceId,messages:[...await this.store.workspaces.conversation(workspaceId),assistant]})>this.store.db.limits.conversationBytes){delete assistant.reasoning;Object.assign(assistant,{reasoningOmitted:true});}
      const updated = await this.store.workspaces.saveDraft(workspaceId, started.draftRevision,
        { draft, input:'',codeReference:null,status: 'idle', activeRequestId: null }, [assistant],workflow,release.owner);
      completed=true;return { workspace: updated, result: { requestId, ...parsed.data, safety: report, model: config.model, tokensUsed: tokens } };
    } catch(e){
      const live=await this.store.workspaces.get(workspaceId);
      if(started&&live?.activeRequestId===requestId&&live.draftRevision===started.draftRevision&&!session.cancelled&&!connectionClosed()){
        workflow.outcome={requestId,requests,firstPassed,repaired,state:'failed',message:e instanceof Error?e.message:'生成失败'};
        await this.store.workspaces.saveDraft(workspaceId,started.draftRevision,{status:'interrupted',activeRequestId:null},[],workflow,release.owner);
      }
      throw e;
    } finally {
      try{await this.store.workspaces.endGeneration(workspaceId, requestId, 'interrupted',release.owner);}finally{if (this.sessions.get(workspaceId) === session) this.sessions.delete(workspaceId);await release(session.cancelled?'cancelled':completed?'completed':'failed');}
    }
  }
  async cancel(workspaceId: string): Promise<void> {
    const session = this.sessions.get(workspaceId); if (!session) return;
    session.cancelled = true; session.client.cancel();
    if(session.client.waitForStop)await session.client.waitForStop();
    await session.started.catch(() => undefined);
    await this.store.workspaces.endGeneration(workspaceId, session.requestId, 'idle',session.release.owner);
    if (this.sessions.get(workspaceId) === session) this.sessions.delete(workspaceId);await session.release('cancelRequested');
  }
}
