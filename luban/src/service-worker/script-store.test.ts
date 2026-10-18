vi.mock('../auto/bridge.ts?script&iife',()=>({default:'test-auto-bridge.js'}));
import 'fake-indexeddb/auto';
import { Database } from './repositories/database';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../shared/constants';
import type { UserScript } from '../shared/types';
import { ScriptStore } from './script-store';
import { StorageManager } from './storage-manager';

vi.mock('../content/index.ts?script&iife', () => ({ default: 'mock-content.js' }));

function makeLocal() {
  const data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string | string[]) => {
      if (key === null) return { ...data };
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

describe('ScriptStore', () => {
  beforeEach(() => {
    local = makeLocal();
    (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  });

  it('保存后索引与单条一致，删除时同步清掉 GM 存储和索引', async () => {
    const store = new ScriptStore(new Database('script-test-' + crypto.randomUUID()), async () => ({}));
    const saved = script('s1');
    await store.save(saved);
    expect(await store.list()).toEqual([{ id: 's1', name: '标红', updatedAt: 2, source: 'ai' }]);
    expect(await store.get('s1')).toEqual(saved);
    await store.writeGm('s1', { k: 'v' });
    expect(await store.readGm('s1')).toEqual({ k: 'v' });
    expect(local.set).not.toHaveBeenCalled();

    await store.delete('s1');
    expect(await store.list()).toEqual([]);
    expect(await store.get('s1')).toBeNull();
    expect(local._data[STORAGE_KEYS.gm('s1')]).toBeUndefined();
  });
});

describe('SAVE_SCRIPT · handleSaveScript', () => {
  let saveLocal: ReturnType<typeof makeLocal>;
  let register: ReturnType<typeof vi.fn>;
  let onMessage: (
    msg: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (r: unknown) => void,
  ) => boolean | void;

  beforeAll(async () => {
    saveLocal = makeLocal();
    register = vi.fn();
    const session = {
      _data: {} as Record<string, unknown>,
      get: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        const out: Record<string, unknown> = {};
        for (const k of keys) if (k in session._data) out[k] = session._data[k];
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => Object.assign(session._data, items)),
    };
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: { local: saveLocal, session },
      userScripts: { register },
      runtime: {
        id: 'test-extension',
        onInstalled: { addListener: vi.fn() },
        onMessage: {
          addListener: (fn: typeof onMessage) => {
            onMessage = fn;
          },
        },
        onConnect: { addListener: vi.fn() },
      },
      action: { onClicked: { addListener: vi.fn() } },
      tabs: { query:vi.fn(async()=>[]),get: vi.fn().mockRejectedValue(new Error('no tab')), sendMessage: vi.fn() },
      scripting: { executeScript: vi.fn() },
      sidePanel: { open: vi.fn(async()=>{}),setOptions:vi.fn(async()=>{}),setPanelBehavior:vi.fn(async()=>{}) },
    };
    await import('./index');
  });

  it('P3 禁止旧 SAVE_SCRIPT 绕过试运行凭证，不写入任何版本', async () => {
    register.mockClear();
    const saved = script('s-save-handler');
    const respond = vi.fn();
    await new Promise<void>((resolve) => {
      onMessage({ type: 'SAVE_SCRIPT', requestId: 'req-save', script: saved }, { id: 'test-extension', url: 'chrome-extension://test-extension/src/sidepanel/index.html?tabId=1' }, (r) => {
        respond(r);
        resolve();
      });
    });
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ok:false,error:expect.objectContaining({code:'RUN_WORKSPACE_REQUIRED'})}));
    const { getScriptStore } = await import('./script-store');
    const stored = await getScriptStore().record('s-save-handler');
    expect(stored).toBeUndefined();
    expect(saveLocal._data[STORAGE_KEYS.script('s-save-handler')]).toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('真实后台路由以侧栏URL绑定tab，同域标签的读取/草稿/授权不能串到另一页',async()=>{
    vi.mocked(chrome.tabs.get).mockImplementation(async(id:number)=>({id,url:'https://example.com/same',title:'tab '+id} as chrome.tabs.Tab));
    const send=(tab:number|undefined,type:string,params:object={})=>new Promise<{ok:boolean;data:any;error:any}>(resolve=>onMessage({type,requestId:crypto.randomUUID(),...params},{id:'test-extension',url:'chrome-extension://test-extension/src/sidepanel/index.html'+(tab===undefined?'':'?tabId='+tab)},r=>resolve(r as {ok:boolean;data:any;error:any})));
    const site=await send(11,'GET_CURRENT_SITE');expect(site.data.tabId).toBe(11);
    expect((await send(undefined,'GET_CURRENT_SITE')).error.code).toBe('RUN_TAB_SCOPE_REQUIRED');
    const a=await send(11,'CREATE_WORKSPACE',{scriptId:null,host:'example.com'}),b=await send(22,'CREATE_WORKSPACE',{scriptId:null,host:'example.com'});expect(a.ok&&b.ok).toBe(true);
    expect((await send(11,'SAVE_DRAFT',{workspaceId:a.data.id,expectedDraftRevision:0,patch:{input:'A only'}})).ok).toBe(true);
    expect((await send(22,'GET_WORKSPACE',{workspaceId:a.data.id})).error.code).toBe('RUN_WRONG_TAB_WORKSPACE');
    expect((await send(22,'LIST_WORKSPACES')).data.map((w:{id:string})=>w.id)).not.toContain(a.data.id);
    expect((await send(22,'V3_PAGE_GRANT',{action:'grant',tabId:11,url:'https://example.com/same'})).ok).toBe(false);
    expect((await send(11,'GET_WORKSPACE',{workspaceId:a.data.id})).data.workspace.input).toBe('A only');
  });
});

describe('StorageManager', () => {
  beforeEach(() => {
    local = makeLocal();
    (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  });

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
