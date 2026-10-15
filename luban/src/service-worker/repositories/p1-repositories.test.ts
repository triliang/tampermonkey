import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Database, request, STORES, byteSize } from './database';
import { ScriptStore } from '../script-store';
import { DraftBuffer } from './draft-buffer';
import { handleWorkspaceCommand } from './workspace-router';
import type { UserScript } from '../../shared/types';

const databases: Database[] = [];
const legacy = (id = 'a'): UserScript => ({ id, name: '工具 '+id, code: 'GM_addStyle("a{}")', description: '说明', explanation: '说明',
  matches: ['*://example.com/*'], gmGrants: ['GM_addStyle'], enabled: true, runAt: 'document-end', source: 'ai', createdAt: 1, updatedAt: 2 });
function setup(snapshot: Record<string, unknown> = {}) {
  const db = new Database('p1-test-'+crypto.randomUUID()); databases.push(db);
  const load = vi.fn(async () => snapshot);
  return { db, load, store: new ScriptStore(db, load) };
}
afterEach(async () => { for (const db of databases.splice(0)) await db.close(); vi.useRealTimers(); });

describe('P1 迁移与权威存储', () => {
  it('同事务迁移脚本和 GM，关闭自动运行，保留备份/Key/settings，漏索引脚本也迁移', async () => {
    const raw = { 'luban:script:a': legacy(), 'luban:script:b': legacy('b'), 'luban:gm:a': { token: 'local-user-value', nullable: null },
      'luban:apiKey': 'secret-untouched', 'luban:settings': { billing: 'tokenPlan' } };
    const { db, store } = setup(raw); await store.ready();
    const a = await store.record('a');
    expect((await store.list()).length).toBe(2); expect(a?.current.code).toBe(legacy().code);
    expect(a?.autoRun.desired).toBe(false); expect(a?.previous).toBeNull(); expect(a?.recordRevision).toBe(1);
    expect(await store.readGm('a')).toEqual({ token: 'local-user-value', nullable: null });
    expect(await db.all('workspaces')).toEqual([]); expect(await db.all('conversations')).toEqual([]);
    expect(raw['luban:apiKey']).toBe('secret-untouched');
    expect(JSON.stringify(await db.all('meta'))).not.toContain('secret-untouched');
  });
  it('重启幂等，成功迁移后删除不会被旧备份复活，不再读取旧来源', async () => {
    const { db, load, store } = setup({ 'luban:script:a': legacy() });
    await store.ready(); await store.delete('a');
    const restarted = new ScriptStore(db, load); await restarted.ready();
    expect(await restarted.list()).toEqual([]); expect(load).toHaveBeenCalledTimes(1);
  });
  it('坏数据不写成功标志，不发生半迁移；修复旧来源后新启动可重试', async () => {
    const raw: Record<string, unknown> = { 'luban:script:a': legacy(), 'luban:script:b': { id: 'b' } };
    const { db, load, store } = setup(raw);
    await expect(store.ready()).rejects.toMatchObject({ code: 'INVALID_SCRIPT' });
    expect(await db.all('scripts')).toEqual([]); expect(await db.get('meta', 'legacyMigration')).toBeUndefined();
    raw['luban:script:b'] = legacy('b'); const restarted = new ScriptStore(db, load);
    await restarted.ready(); expect((await restarted.list()).length).toBe(2);
  });
  it('IDB 写入异常使正文、GM、成功标志整体回滚，重启可重试', async () => {
    const { db, load, store } = setup({ 'luban:script:a': legacy() });
    const real = db.mutate.bind(db);
    vi.spyOn(db, 'mutate').mockImplementationOnce((work, migration) => real(async tx => {
      await work(tx); throw new Error('disk failure');
    }, migration));
    await expect(store.ready()).rejects.toThrow('disk failure');
    expect(await db.all('scripts')).toEqual([]); expect(await db.all('gm')).toEqual([]);
    expect(await db.get('meta', 'legacyMigration')).toBeUndefined();
    await new ScriptStore(db, load).ready(); expect((await db.all('scripts')).length).toBe(1);
  });
  it('旧宽规则只保留元数据并要求确认，不自动开启或扩大网站', async () => {
    const s = legacy(); s.matches = ['*://*.example.com/*'];
    const { store } = setup({ 'luban:script:a': s });
    const record = await store.record('a'); expect(record?.needsRuleReview).toBe(true); expect(record?.host).toBeNull(); expect(record?.autoRun.desired).toBe(false);
  });
  it('旧 SAVE_SCRIPT 入口拒绝覆盖已有 ID', async () => {
    const { store } = setup(); await store.save(legacy());
    await expect(store.save({ ...legacy(), code: 'changed' })).rejects.toMatchObject({ code: 'LEGACY_UPDATE_REJECTED' });
    expect((await store.get('a'))?.code).toBe(legacy().code);
  });
});

describe('P1 工作区、并发和事务', () => {
  it('A/B 与新建草稿的代码、对话隔离，关闭仓储后能找回', async () => {
    const { db, load, store } = setup({ 'luban:script:a': legacy(), 'luban:script:b': legacy('b') });
    const a = await store.workspaces.create('a'), b = await store.workspaces.create('b'), n = await store.workspaces.create(null, 'new.example.com');
    const version = (await store.record('a'))!.current;
    await store.workspaces.saveDraft(a.id, 0, { draft: version, input: '调整A' }, [{ role: 'user', text: '仅A', createdAt: 1 }]);
    await store.workspaces.saveDraft(n.id, 0, { input: '未保存需求' });
    await db.close(); const restarted = new ScriptStore(db, load);
    expect((await restarted.workspaces.get(a.id))?.input).toBe('调整A');
    expect(await restarted.workspaces.conversation(b.id)).toEqual([]);
    expect((await restarted.workspaces.get(n.id))?.input).toBe('未保存需求');
    expect((await restarted.record('a'))?.previous).toBeNull();
  });
  it('两客户端同 revision 更新只有一份成功，旧内容不会覆盖新版本', async () => {
    const { db, store } = setup({ 'luban:script:a': legacy() }); await store.ready();
    const other = new ScriptStore(new Database(db.name), async () => ({})); databases.push(other.db); await other.ready();
    const result = await Promise.allSettled([store.workspaces.rename('a', 1, '一'), other.workspaces.rename('a', 1, '二')]);
    expect(result.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    const rejected = result.find(x => x.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('REVISION_CONFLICT'); expect((await store.record('a'))?.recordRevision).toBe(2);
  });
  it('旧草稿提交拒绝；工作区已有内容不被迟到写覆盖', async () => {
    const { store } = setup(); const ws = await store.workspaces.create();
    await store.workspaces.saveDraft(ws.id, 0, { input: '新版' });
    await expect(store.workspaces.saveDraft(ws.id, 0, { input: '旧版' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect((await store.workspaces.get(ws.id))?.input).toBe('新版');
    await expect(store.workspaces.saveDraft(ws.id, 1, { draft: false } as unknown as import('../../shared/v2-types').DraftPatch)).rejects.toMatchObject({ code: 'INVALID_DRAFT' });
  });
  it('跨记录中止保留 current/previous 和 revision', async () => {
    const { db, store } = setup({ 'luban:script:a': legacy() }); const before = (await store.record('a'))!;
    await expect(db.mutate(async tx => {
      await request(tx.objectStore('scripts').put({ ...before, current: { ...before.current, code: 'B' }, previous: before.current, recordRevision: 2 }));
      await request(tx.objectStore('operations').put({ id: 'op' })); throw new Error('abort checkpoint');
    })).rejects.toThrow('abort checkpoint');
    expect(await store.record('a')).toEqual(before); expect(await db.all('operations')).toEqual([]);
  });
  it('重启将 generating 转 interrupted、保留草稿，pending 日志不伪装已恢复', async () => {
    const { db, load, store } = setup({ 'luban:script:a': legacy() }); const ws = await store.workspaces.create('a');
    await store.workspaces.saveDraft(ws.id, 0, { input: '保留', draft: (await store.record('a'))!.current, status: 'generating', activeRequestId: 'request' });
    await store.workspaces.prepareOperation({ id: 'op', scriptId: 'a', expectedRevision: 1, type: 'update', phase: 'prepared', createdAt: 1 });
    await db.close(); const restarted = new ScriptStore(db, load); await restarted.ready();
    const after = await restarted.workspaces.get(ws.id);
    expect(after?.status).toBe('interrupted'); expect(after?.input).toBe('保留'); expect(after?.draft).not.toBeNull(); expect(after?.activeRequestId).toBeNull();
    expect((await db.get<{ phase: string }>('operations', 'op'))?.phase).toBe('recovery_required');
    await expect(restarted.workspaces.rename('a', 1, '不能覆盖')).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' });
  });
  it('丢弃草稿不会改变 current/previous 或对话', async () => {
    const { store } = setup({ 'luban:script:a': legacy() }); const before = await store.record('a'); const ws = await store.workspaces.create('a');
    await store.workspaces.saveDraft(ws.id, 0, { draft: before!.current }, [{ role: 'user', text: '需求', createdAt: 1 }]);
    await store.workspaces.discard(ws.id, 1); expect(await store.record('a')).toEqual(before);
    expect(await store.workspaces.conversation(ws.id)).toHaveLength(1);
  });
  it('GM 增量事务合并不同 key，合法 null 不等于删除', async () => {
    const { store } = setup({ 'luban:script:a': legacy() });
    await Promise.all([store.workspaces.writeGm('a', [{ op: 'set', key: 'a', value: 1 }]), store.workspaces.writeGm('a', [{ op: 'set', key: 'b', value: null }])]);
    expect(await store.readGm('a')).toEqual({ a: 1, b: null });
    await store.workspaces.writeGm('a', [{ op: 'delete', key: 'a' }]); expect(await store.readGm('a')).toEqual({ b: null });
  });
  it('单版/对话超限时，草稿与对话原样保留（测试配置，不算真实40MiB验收）', async () => {
    const { store, db } = setup({ 'luban:script:a': legacy() }); const ws = await store.workspaces.create('a');
    db.limits.codeBytes = 2;
    await expect(store.workspaces.saveDraft(ws.id, 0, { draft: (await store.record('a'))!.current })).rejects.toMatchObject({ code: 'CODE_TOO_LARGE' });
    db.limits.conversationBytes = 80;
    await expect(store.workspaces.saveDraft(ws.id, 0, { input: '不能写入' }, [{ role: 'user', text: '汉'.repeat(50), createdAt: 1 }])).rejects.toMatchObject({ code: 'CONVERSATION_TOO_LARGE' });
    expect((await store.workspaces.get(ws.id))?.draftRevision).toBe(0); expect(await store.workspaces.conversation(ws.id)).toEqual([]);
    expect(byteSize('汉')).toBeGreaterThan('汉'.length);
  });
  it('总量事务守卫覆盖多客户端并发：只允许一份增长，原成果不变', async () => {
    const { db, store } = setup(); const a = await store.workspaces.create(), b = await store.workspaces.create();
    const before = await db.transaction(STORES, 'readonly', tx => db.usage(tx)); db.limits.totalBytes = before + 250;
    const result = await Promise.allSettled([store.workspaces.saveDraft(a.id, 0, { input: 'x'.repeat(200) }), store.workspaces.saveDraft(b.id, 0, { input: 'y'.repeat(200) })]);
    expect(result.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect((result.find(x => x.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('TOTAL_TOO_LARGE');
  });
  it('删除脚本事务清理工作区/对话/GM，其他脚本不受影响', async () => {
    const { store, db } = setup({ 'luban:script:a': legacy(), 'luban:script:b': legacy('b') }); const a = await store.workspaces.create('a'); const b = await store.workspaces.create('b');
    await store.workspaces.writeGm('a', [{ op: 'set', key: 'x', value: 1 }]); await store.delete('a');
    expect(await store.workspaces.get(a.id)).toBeUndefined(); expect(await store.workspaces.get(b.id)).toBeDefined(); expect(await db.get('gm', 'a')).toBeUndefined();
  });
});

describe('P1 消息来源和草稿缓冲', () => {
  it('拒绝普通网页/伪造来源和非法 patch，允许带 sender.tab 的真实扩展页', async () => {
    Object.assign(globalThis, { chrome: { runtime: { id: 'luban-test' } } });
    const { store } = setup(); const msg = { type: 'CREATE_WORKSPACE', requestId: '1', scriptId: null, host: 'example.com' };
    await expect(handleWorkspaceCommand(msg, { id: 'luban-test', url: 'https://example.com' }, store)).rejects.toMatchObject({ code: 'FORBIDDEN_SOURCE' });
    const sender = { id: 'luban-test', url: 'chrome-extension://luban-test/src/sidepanel/index.html', tab: { id: 1 } } as chrome.runtime.MessageSender;
    const ws = await handleWorkspaceCommand(msg, sender, store) as { id: string };
    await expect(handleWorkspaceCommand({ type: 'SAVE_DRAFT', requestId: '2', workspaceId: ws.id, expectedDraftRevision: 0, patch: { scriptId: 'other' } }, sender, store)).rejects.toMatchObject({ code: 'INVALID_DRAFT' });
  });
  it('离开前 flush 落盘；失败保留 pending，可重试而不静默丢输入', async () => {
    const { store } = setup(); const ws = await store.workspaces.create();
    const writer = vi.fn().mockImplementationOnce(() => { throw new Error('quota failure'); }).mockImplementation((rev, patch) => store.workspaces.saveDraft(ws.id, rev, patch));
    const buffer = new DraftBuffer(0, writer, vi.fn(), 60000); buffer.schedule({ input: '必须保留' });
    await expect(buffer.flush()).rejects.toThrow('quota failure');
    expect((await store.workspaces.get(ws.id))?.input).toBe('');
    await buffer.flush(); expect((await store.workspaces.get(ws.id))?.input).toBe('必须保留'); buffer.dispose();
  });
  it('防抖批量输入与写入中的新增输入都按新 revision 保存', async () => {
    const { store } = setup(); const ws = await store.workspaces.create();
    const buffer = new DraftBuffer(0, (rev, patch) => store.workspaces.saveDraft(ws.id, rev, patch), vi.fn(), 60000);
    buffer.schedule({ input: '一' }); const first = buffer.flush(); buffer.schedule({ input: '二' }); await first; await buffer.flush();
    expect((await store.workspaces.get(ws.id))?.input).toBe('二'); expect((await store.workspaces.get(ws.id))?.draftRevision).toBe(2); buffer.dispose();
  });
});
