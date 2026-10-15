export const STORES = ['scripts', 'workspaces', 'conversations', 'gm', 'operations', 'receipts', 'runtimeStatus', 'meta'] as const;
export type StoreName = typeof STORES[number];
export const DEFAULT_LIMITS = { codeBytes: 256 * 1024, conversationBytes: 1024 * 1024, totalBytes: 40 * 1024 * 1024 };
export type StorageLimits = typeof DEFAULT_LIMITS;

export class DataError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'DataError'; }
}
export function byteSize(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) throw new DataError('INVALID_DATA', '数据无法序列化。');
  return new TextEncoder().encode(json).length;
}
export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export class Database {
  private connection: Promise<IDBDatabase> | null = null;
  public readonly limits: StorageLimits;
  constructor(public readonly name = 'luban-v2', limits: StorageLimits = DEFAULT_LIMITS) { this.limits = { ...limits }; }
  open(): Promise<IDBDatabase> {
    if (!this.connection) this.connection = new Promise((resolve, reject) => {
      let rejected = false;
      const r = indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => {
        for (const name of STORES) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'id' });
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => { rejected = true; reject(new DataError('DB_BLOCKED', '数据库升级被旧窗口阻塞，请关闭旧窗口重试。')); };
      r.onsuccess = () => {
        const db = r.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    });
    return this.connection;
  }
  async close(): Promise<void> { if (this.connection) (await this.connection).close(); this.connection = null; }
  async transaction<T>(names: readonly StoreName[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.open();
    const tx = db.transaction([...names], mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new DataError('TRANSACTION_ABORTED', '数据写入已中止。'));
      tx.onerror = () => { /* onabort 返回事务最终失败；不吞掉浏览器默认 abort。 */ };
    });
    try { const value = await work(tx); await done; return value; }
    catch (e) { try { tx.abort(); } catch { /* 已结束 */ } await done.catch(() => undefined); throw e; }
  }
  get<T>(store: StoreName, id: string): Promise<T | undefined> {
    return this.transaction([store], 'readonly', tx => request(tx.objectStore(store).get(id)));
  }
  all<T>(store: StoreName): Promise<T[]> {
    return this.transaction([store], 'readonly', tx => request(tx.objectStore(store).getAll()));
  }
  /** 应用逻辑容量（含记录元信息）；不是 IDB 磁盘物理用量。事务内不能等待网络/Chrome API。 */
  async usage(tx: IDBTransaction): Promise<number> {
    const rows = await Promise.all(STORES.map(name => request(tx.objectStore(name).getAll())));
    return rows.reduce((sum, entries) => sum + entries.reduce((n, row) => n + byteSize(row), 0), 0);
  }
  mutate<T>(work: (tx: IDBTransaction) => Promise<T>, migration = false): Promise<T> {
    return this.transaction(STORES, 'readwrite', async tx => {
      const before = await this.usage(tx);
      const value = await work(tx);
      const after = await this.usage(tx);
      // 升级不因新软上限丢失旧成果；超限后允许缩减、不允许继续增长。
      if (!migration && after > this.limits.totalBytes && after > before) throw new DataError('TOTAL_TOO_LARGE', '本地数据超过总容量上限，请先删除不需要的工具或草稿。');
      return value;
    });
  }
}
