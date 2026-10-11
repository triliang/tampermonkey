// chrome.storage.local 的批量读写与内存缓存。同一次 set 只打一次 IPC。

export class StorageManager {
  private cache = new Map<string, unknown>();
  private seen = new Set<string>();

  async get(key: string): Promise<unknown> {
    if (this.seen.has(key)) return this.cache.get(key);
    const stored = await chrome.storage.local.get(key);
    this.seen.add(key);
    if (Object.prototype.hasOwnProperty.call(stored, key)) this.cache.set(key, stored[key]);
    return this.cache.get(key);
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await chrome.storage.local.set(items);
    for (const [key, value] of Object.entries(items)) {
      this.cache.set(key, value);
      this.seen.add(key);
    }
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await chrome.storage.local.remove(keys);
    for (const key of keys) {
      this.cache.delete(key);
      this.seen.add(key);
    }
  }
}
