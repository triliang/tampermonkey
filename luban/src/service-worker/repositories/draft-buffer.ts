import type { DraftPatch, WorkspaceRecord } from '../../shared/v2-types';

/** UI 用的写入缓冲：P2 接入离开对话框；flush 失败保留 pending，不能直接离开。 */
export class DraftBuffer {
  private pending: DraftPatch | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<WorkspaceRecord> | null = null;
  private revision: number;
  constructor(revision: number, private writer: (revision: number, patch: DraftPatch) => Promise<WorkspaceRecord>,
    private onError: (error: unknown) => void, private delay = 500) { this.revision = revision; }
  schedule(patch: DraftPatch): void {
    this.pending = { ...this.pending, ...patch };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(this.onError); }, this.delay);
  }
  async flush(): Promise<WorkspaceRecord | undefined> {
    clearTimeout(this.timer);
    if (this.inFlight) { await this.inFlight; return this.flush(); }
    if (!this.pending) return undefined;
    const patch = this.pending; this.pending = null;
    const write = Promise.resolve().then(() => this.writer(this.revision, patch)); this.inFlight = write;
    try { const result = await write; this.revision = result.draftRevision; return result; }
    catch (e) { this.pending = Object.assign({}, patch, this.pending); throw e; }
    finally { this.inFlight = null; }
  }
  /** 关闭前由调用者 await flush；dispose 不宣称未确认写入已保存。 */
  dispose(): void { clearTimeout(this.timer); }
}
