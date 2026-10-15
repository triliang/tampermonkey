import {REASONING_BYTES} from '../../shared/reasoning';
import type {TrialReceipt} from '../../shared/p3-types';
import {validReference} from '../../shared/code-reference';
import type {Workflow} from '../../shared/v21-types';
import type { ConversationMessage, DraftPatch, OperationRecord, ScriptRecord, ScriptVersion, WorkspaceRecord, GmDelta } from '../../shared/v2-types';
import { byteSize, DataError, Database, request } from './database';

export function validateVersion(v: unknown): asserts v is ScriptVersion {
  const x = v as ScriptVersion | null;
  if (!x || typeof x !== 'object' || typeof x.versionId !== 'string' || !x.versionId || typeof x.hash !== 'string'
    || typeof x.code !== 'string' || typeof x.explanation !== 'string' || !Array.isArray(x.grants)
    || !x.grants.every(g => typeof g === 'string') || !['document_start', 'document_end', 'document_idle'].includes(x.runAt)
    || !Number.isFinite(x.createdAt)) throw new DataError('INVALID_DRAFT', '草稿结构无效。');
}
export class WorkspaceStore {
  constructor(public readonly db: Database, private initialize: () => Promise<void> = async () => undefined) {}
  private async writableScript(tx: IDBTransaction, id: string, expected: number): Promise<ScriptRecord> {
    const s = await request<ScriptRecord | undefined>(tx.objectStore('scripts').get(id));
    if (!s || s.tombstone) throw new DataError('SCRIPT_MISSING', '脚本不存在或已删除。');
    if (s.recordRevision !== expected) throw new DataError('REVISION_CONFLICT', '脚本已在其他窗口更新，请重载；当前草稿仍保留。');
    const ops = await request<OperationRecord[]>(tx.objectStore('operations').getAll());
    if (ops.some(op => op.scriptId === id)) throw new DataError('RECOVERY_REQUIRED', '脚本有未完成的注册操作，恢复前禁止覆盖。');
    return s;
  }
  async create(scriptId: string | null = null, host: string | null = null): Promise<WorkspaceRecord> {
    await this.initialize();
    if (host !== null && (typeof host !== 'string' || !/^[a-z\d.-]+$/i.test(host))) throw new DataError('INVALID_HOST', '主机名无效。');
    const id = crypto.randomUUID();
    return this.db.mutate(async tx => {
      const s = scriptId ? await request<ScriptRecord | undefined>(tx.objectStore('scripts').get(scriptId)) : undefined;
      if (scriptId && (!s || s.tombstone)) throw new DataError('SCRIPT_MISSING', '脚本不存在。');
      const workspace: WorkspaceRecord = { id, scriptId, host: s?.host ?? host, baseRevision: s?.recordRevision ?? null,
        draftRevision: 0, input: '', draft: null, activeRequestId: null, status: 'idle', updatedAt: Date.now() };
      await request(tx.objectStore('workspaces').add(workspace));
      await request(tx.objectStore('conversations').add({ id, messages: [] }));
      return workspace;
    });
  }
  async get(id: string): Promise<WorkspaceRecord | undefined> { await this.initialize(); return this.db.get('workspaces', id); }
  async list(): Promise<WorkspaceRecord[]> { await this.initialize(); return this.db.all('workspaces'); }
  async conversation(id: string): Promise<ConversationMessage[]> {
    await this.initialize(); return (await this.db.get<{ id: string; messages: ConversationMessage[] }>('conversations', id))?.messages ?? [];
  }
  async saveDraft(id: string, expectedRevision: number, patch: DraftPatch, messages: ConversationMessage[] = [], workflow?:Workflow): Promise<WorkspaceRecord> {
    await this.initialize();
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || !patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(k => !['input', 'draft', 'status', 'activeRequestId','codeReference'].includes(k))
      || Object.values(patch).some(value => value === undefined)
      || (patch.input !== undefined && typeof patch.input !== 'string')
      || (patch.status !== undefined && !['idle', 'generating', 'interrupted'].includes(patch.status))
      || (patch.activeRequestId !== undefined && patch.activeRequestId !== null && typeof patch.activeRequestId !== 'string')
      || !Array.isArray(messages) || messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string' || !Number.isFinite(m.createdAt) || (m.reasoning!==undefined&&(!Array.isArray(m.reasoning)||m.reasoning.length>2||m.reasoning.some(s=>!s||![1,2].includes(s.attempt)||typeof s.text!=='string'||new TextEncoder().encode(s.text).length>REASONING_BYTES||typeof s.truncated!=='boolean'))))) {
      throw new DataError('INVALID_DRAFT', '工作区消息结构无效。');
    }
    if(patch.codeReference!==undefined&&patch.codeReference!==null&&!validReference(patch.codeReference,id))throw new DataError('INVALID_REFERENCE','代码引用无效或超过上限。');
    if (patch.draft !== undefined && patch.draft !== null) {
      validateVersion(patch.draft);
      if (new TextEncoder().encode(patch.draft.code).length > this.db.limits.codeBytes) throw new DataError('CODE_TOO_LARGE', '代码超过单版容量上限。');
    }
    return this.db.mutate(async tx => {
      const store = tx.objectStore('workspaces');
      const ws = await request<WorkspaceRecord | undefined>(store.get(id));
      if (!ws) throw new DataError('WORKSPACE_MISSING', '草稿不存在。');
      if (ws.draftRevision !== expectedRevision) throw new DataError('REVISION_CONFLICT', '草稿已在其他窗口修改，请重载。');
      // 草稿允许保留在旧 base 上，提交版本时才检查脚本 CAS，不因冲突丢弃输入。
      const conversation = await request<{ id: string; messages: ConversationMessage[] }>(tx.objectStore('conversations').get(id));
      const next = { id, messages: [...(conversation?.messages ?? []), ...messages] };
      if (byteSize(next) > this.db.limits.conversationBytes) throw new DataError('CONVERSATION_TOO_LARGE', '对话超过工作区容量上限，原对话与草稿未改变。');
      Object.assign(ws, patch, { draftRevision: ws.draftRevision + 1, updatedAt: Date.now() });
      await request(store.put(ws));
      // A quote is request metadata, not a code/effect change. Carry forward only
      // currently valid revision-bound receipts; never revive an older receipt.
      if(Object.keys(patch).length===1&&'codeReference' in patch&&!messages.length&&!workflow&&ws.status!=='generating'){
        for(const receipt of await request<TrialReceipt[]>(tx.objectStore('receipts').getAll())){
          if(receipt.workspaceId===id&&receipt.draftRevision===expectedRevision){receipt.draftRevision=ws.draftRevision;await request(tx.objectStore('receipts').put(receipt));}
        }
      }
      if(patch.draft!==undefined&&!workflow){const row=await request<{id:string;workspaceId:string;workflow:Workflow}|undefined>(tx.objectStore('meta').get('v21:workflow:'+id));if(row){delete row.workflow.quality;row.workflow.revision++;await request(tx.objectStore('meta').put(row));}}
      if(workflow){if(byteSize(workflow)>32*1024+(workflow.failure?this.db.limits.codeBytes:0))throw new DataError('WORKFLOW_TOO_LARGE','目标或诊断过大，原草稿保留。');await request(tx.objectStore('meta').put({id:'v21:workflow:'+id,workspaceId:id,workflow}));if(workflow.outcome?.requestId){await request(tx.objectStore('meta').put({id:'v21:session:'+workflow.outcome.requestId,workspaceId:id,outcome:workflow.outcome,createdAt:Date.now()}));const sessions=(await request<Array<{id:string;workspaceId?:string;createdAt?:number}>>(tx.objectStore('meta').getAll())).filter(x=>x.workspaceId===id&&x.id.startsWith('v21:session:')).sort((a,b)=>(b.createdAt??0)-(a.createdAt??0));for(const stale of sessions.slice(20))await request(tx.objectStore('meta').delete(stale.id));}}
      await request(tx.objectStore('conversations').put(next));
      return ws;
    });
  }
  discard(id: string, expectedRevision: number): Promise<WorkspaceRecord> {
    return this.saveDraft(id, expectedRevision, { input: '', draft: null, codeReference:null,activeRequestId: null, status: 'idle' },[],{revision:0,constraints:'',feedback:'',scope:'page',selectors:[],targetFingerprint:null,strategyConfirmed:false,binding:null});
  }
  async rename(id: string, expectedRevision: number, name: string): Promise<ScriptRecord> {
    await this.initialize();
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || /[\r\n\x00-\x1f]/.test(name)) throw new DataError('INVALID_NAME', '名称不能为空。');
    return this.db.mutate(async tx => {
      const s = await this.writableScript(tx, id, expectedRevision);
      s.name = name.trim(); s.recordRevision++; s.updatedAt = Date.now();
      for (const ws of await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll())) {
        if (ws.scriptId === id && ws.baseRevision === expectedRevision) { ws.baseRevision = s.recordRevision; await request(tx.objectStore('workspaces').put(ws)); }
      }
      await request(tx.objectStore('scripts').put(s)); return s;
    });
  }
  async prepareOperation(op: OperationRecord): Promise<void> {
    await this.initialize();
    if (!op || typeof op.id !== 'string' || !op.id || typeof op.scriptId !== 'string' || !Number.isInteger(op.expectedRevision)
      || !['update', 'restore', 'enable', 'disable', 'delete'].includes(op.type) || op.phase !== 'prepared' || !Number.isFinite(op.createdAt)) {
      throw new DataError('INVALID_OPERATION', '操作日志无效。');
    }
    if (op.candidate) validateVersion(op.candidate);
    await this.db.mutate(async tx => { await this.writableScript(tx, op.scriptId, op.expectedRevision); await request(tx.objectStore('operations').add(op)); });
  }
  async endGeneration(id: string, requestId: string, status: 'idle' | 'interrupted'): Promise<void> {
    await this.initialize();
    await this.db.mutate(async tx => {
      const store = tx.objectStore('workspaces');
      const ws = await request<WorkspaceRecord | undefined>(store.get(id));
      if (!ws || ws.activeRequestId !== requestId) return;
      ws.status = status; ws.activeRequestId = null; ws.draftRevision++; ws.updatedAt = Date.now();
      await request(store.put(ws));
    });
  }
  async readGm(id: string): Promise<Record<string, unknown>> {
    await this.initialize(); return (await this.db.get<{ id: string; values: Record<string, unknown> }>('gm', id))?.values ?? {};
  }
  async writeGm(id: string, changes: GmDelta[]): Promise<void> {
    await this.initialize();
    if (!Array.isArray(changes) || changes.some(d => !d || typeof d.key !== 'string' || !['set', 'delete'].includes(d.op)
      || (d.op === 'set' && JSON.stringify(d.value) === undefined))) throw new DataError('INVALID_GM', 'GM 增量无效。');
    await this.db.mutate(async tx => {
      const s = await request<ScriptRecord | undefined>(tx.objectStore('scripts').get(id));
      if (!s || s.tombstone) throw new DataError('SCRIPT_MISSING', '脚本不存在。');
      const store = tx.objectStore('gm');
      const row = await request<{ id: string; values: Record<string, unknown> } | undefined>(store.get(id));
      const values = Object.assign(Object.create(null), row?.values);
      for (const d of changes) { if (d.op === 'delete') delete values[d.key]; else values[d.key] = d.value; }
      await request(store.put({ id, values }));
    });
  }
  async recoverLocalState(): Promise<void> {
    // P1 不调用 Chrome 注册 API，也不把未处理日志当作已恢复。P4 接管注册恢复后才能解除写保护。
    await this.db.mutate(async tx => {
      for (const ws of await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll())) {
        if (ws.status === 'generating') { ws.status = 'interrupted'; ws.activeRequestId = null; ws.draftRevision++; await request(tx.objectStore('workspaces').put(ws)); }
      }
      for (const op of await request<OperationRecord[]>(tx.objectStore('operations').getAll())) {
        op.phase = 'recovery_required'; await request(tx.objectStore('operations').put(op));
      }
    }, true);
  }
}
