import type { ScriptMeta, UserScript } from '../shared/types';
import type { ScriptRecord, WorkspaceRecord, OperationRecord } from '../shared/v2-types';
import { DataError, Database, request } from './repositories/database';
import { migrateLegacy, recordFromLegacy, type LegacySnapshot } from './repositories/migration';
import { WorkspaceStore } from './repositories/workspace-store';
import {assertScriptExecutionIdle,assertWorkspaceOwner} from './services/workspace-lock';

/** V1 UI 兼容适配器；权威业务数据已迁入 IDB，不能再直接覆盖旧存储键。 */
export class ScriptStore {
  private initialization: Promise<void> | null = null;
  readonly workspaces: WorkspaceStore;
  constructor(public readonly db = new Database(), private snapshot: LegacySnapshot = () => chrome.storage.local.get(null)) {
    this.workspaces = new WorkspaceStore(db, () => this.ready());
  }
  ready(): Promise<void> {
    if (!this.initialization) this.initialization = (async () => {
      await migrateLegacy(this.db, this.snapshot);
      await new WorkspaceStore(this.db).recoverLocalState();
    })();
    const pending=this.initialization;
    void pending.catch(()=>{if(this.initialization===pending)this.initialization=null;});
    return this.initialization;
  }
  async list(): Promise<ScriptMeta[]> {
    await this.ready();
    return (await this.db.all<ScriptRecord>('scripts')).filter(s => !s.tombstone)
      .map(({ id, name, updatedAt, source }) => ({ id, name, updatedAt, source })).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async record(id: string): Promise<ScriptRecord | undefined> { await this.ready(); return this.db.get('scripts', id); }
  async get(id: string): Promise<UserScript | null> {
    const s = await this.record(id);
    if (!s || s.tombstone) return null;
    return { id: s.id, name: s.name, description: s.current.explanation, explanation: s.current.explanation,
      code: s.current.code, matches: s.matches, enabled: s.enabled,
      runAt: s.current.runAt === 'document_idle' ? 'idle' : s.current.runAt === 'document_start' ? 'document-start' : 'document-end',
      source: s.source, gmGrants: s.current.grants, aiMeta: s.aiMeta, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }
  async save(script: UserScript): Promise<string> {
    await this.ready(); const record = await recordFromLegacy(script);
    if (new TextEncoder().encode(record.current.code).length > this.db.limits.codeBytes) throw new DataError('CODE_TOO_LARGE', '代码超过单版容量上限。');
    return this.db.mutate(async tx => {
      if (await request(tx.objectStore('scripts').get(record.id))) throw new DataError('LEGACY_UPDATE_REJECTED', '旧保存入口不能覆盖已有脚本，请使用工作区更新流程。');
      await request(tx.objectStore('scripts').add(record)); return record.id;
    });
  }
  async delete(id: string): Promise<void> {
    await this.ready();
    await this.db.mutate(async tx => {
      await assertScriptExecutionIdle(tx,id);
      const s = await request<ScriptRecord | undefined>(tx.objectStore('scripts').get(id));
      const ops = await request<OperationRecord[]>(tx.objectStore('operations').getAll());
      if (s?.autoRun.desired || ops.some(op => op.scriptId === id)) throw new DataError('RECOVERY_REQUIRED', '脚本仍有注册或未完成操作，请先停用并恢复。');
      for (const ws of await request<WorkspaceRecord[]>(tx.objectStore('workspaces').getAll())) {
        if (ws.scriptId === id) {
          await assertWorkspaceOwner(tx,ws.id);
          await request(tx.objectStore('workspaces').delete(ws.id));
          await request(tx.objectStore('conversations').delete(ws.id));
          await request(tx.objectStore('meta').delete('v21:workflow:'+ws.id));
          const receipts = await request<Array<{ id: string; workspaceId: string }>>(tx.objectStore('receipts').getAll());
          for (const r of receipts) if (r.workspaceId === ws.id) await request(tx.objectStore('receipts').delete(r.id));
        }
      }
      await request(tx.objectStore('scripts').delete(id)); await request(tx.objectStore('gm').delete(id));
      await request(tx.objectStore('runtimeStatus').delete(id));
    });
  }
  readGm(id: string): Promise<Record<string, unknown>> { return this.workspaces.readGm(id); }
  /** 旧 runner 用 null 表示 delete；V2 typed delta 区分合法 null，P4 替换 runner。 */
  writeGm(id: string, dirty: Record<string, unknown>): Promise<void> {
    return this.workspaces.writeGm(id, Object.entries(dirty).map(([key, value]) => value === null ? { op: 'delete', key } : { op: 'set', key, value }));
  }
}
let singleton: ScriptStore | null = null;
export function getScriptStore(): ScriptStore { return singleton ??= new ScriptStore(); }

/** V1 手动匹配兼容；V2 自动运行准确匹配由后续 host policy 实现。 */
export function pageMatchesScript(pageUrl: string, matches: string[]): boolean {
  let host = '';
  try { const url = new URL(pageUrl); if (!['http:', 'https:'].includes(url.protocol)) return false; host = url.hostname; } catch { return false; }
  return matches.some(pattern => { const rule = pattern.replace(/^\*:\/\//, '').replace(/\/\*.*$/, '').replace(/^\*\./, ''); return host === rule || host.endsWith(`.${rule}`); });
}
