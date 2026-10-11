import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../shared/constants';
import type { UserScript } from '../shared/types';
import { ScriptStore } from './script-store';
import { StorageManager } from './storage-manager';

function makeLocal() {
  const data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = data[k];
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => Object.assign(data, items)),
    remove: vi.fn(async (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key]) delete data[k];
    }),
    _data: data,
  };
}

function script(id: string, name = '标红'): UserScript {
  return {
    id,
    name,
    description: '说明',
    explanation: '说明',
    code: 'GM_addStyle("x{}")',
    matches: ['*://example.com/*'],
    enabled: true,
    runAt: 'document-end',
    source: 'ai',
    gmGrants: ['GM_addStyle'],
    aiMeta: {
      intent: '标红',
      provider: 'xiaomi-mimo',
      model: 'mimo-v2.6-flash',
      pageContextSnapshot: { url: 'https://example.com', title: 'ex' },
      createdAt: 1,
    },
    createdAt: 1,
    updatedAt: 2,
  };
}

let local: ReturnType<typeof makeLocal>;

beforeEach(() => {
  local = makeLocal();
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
});

describe('ScriptStore', () => {
  it('保存后索引与单条一致，删除时同步清掉 GM 存储和索引', async () => {
    const store = new ScriptStore(new StorageManager());
    const saved = script('s1');
    await store.save(saved);
    expect(await store.list()).toEqual([{ id: 's1', name: '标红', updatedAt: 2, source: 'ai' }]);
    expect(await store.get('s1')).toEqual(saved);
    await store.writeGm('s1', { k: 'v' });
    expect(local._data[STORAGE_KEYS.gm('s1')]).toEqual({ k: 'v' });

    await store.delete('s1');
    expect(await store.list()).toEqual([]);
    expect(await store.get('s1')).toBeNull();
    expect(local._data[STORAGE_KEYS.gm('s1')]).toBeUndefined();
  });
});

describe('StorageManager', () => {
  it('一次 set 写入 100 个 key，只调用一次 storage.local.set', async () => {
    const storage = new StorageManager();
    const items: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) items[`luban:script:${i}`] = i;
    await storage.set(items);
    expect(local.set).toHaveBeenCalledTimes(1);
  });

  it('缓存命中后第二次 get 不再访问 storage', async () => {
    local._data.a = 1;
    const storage = new StorageManager();
    await storage.get('a');
    local.get.mockClear();
    await storage.get('a');
    expect(local.get).not.toHaveBeenCalled();
  });
});
