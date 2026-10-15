import { ScriptStore } from '../../src/service-worker/script-store';
import { Database, request } from '../../src/service-worker/repositories/database';
import type { UserScript } from '../../src/shared/types';

const button = document.querySelector<HTMLButtonElement>('#run')!;
const output = document.querySelector<HTMLPreElement>('#result')!;
button.onclick = async () => {
  button.disabled = true;
  const results: string[] = [];
  const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); results.push('PASS · '+label); output.textContent = results.join('\n'); };
  const db = new Database('luban-p1-browser-test-'+crypto.randomUUID());
  const raw: UserScript = { id: 'a', name: '迁移测试', description: '说明', explanation: '说明', code: 'GM_addStyle("a{}")', matches: ['*://example.com/*'],
    enabled: true, runAt: 'document-end', source: 'ai', gmGrants: ['GM_addStyle'], createdAt: 1, updatedAt: 2 };
  const snapshot = async () => ({ 'luban:script:a': raw, 'luban:gm:a': { keep: 1 }, 'luban:apiKey': 'TEST_ONLY_NOT_A_REAL_KEY' });
  try {
    const store = new ScriptStore(db, snapshot); await store.ready();
    const original = (await store.record('a'))!;
    assert(original.current.code === raw.code && !original.autoRun.desired && original.previous === null, '旧脚本迁移、自动运行关闭');
    assert((await store.readGm('a')).keep === 1 && !JSON.stringify(await db.all('meta')).includes('TEST_ONLY_NOT_A_REAL_KEY'), 'GM 保留，Key 不迁移');
    const a = await store.workspaces.create('a'), b = await store.workspaces.create(null, 'example.com');
    await store.workspaces.saveDraft(a.id, 0, { input: '仅A', draft: original.current, status: 'generating', activeRequestId: 'interrupted-request' }, [{ role: 'user', text: '仅A对话', createdAt: 1 }]);
    assert((await store.workspaces.get(b.id))?.input === '' && (await store.workspaces.conversation(b.id)).length === 0, '工作区与对话隔离');
    await db.close(); const restarted = new ScriptStore(db, snapshot); await restarted.ready();
    const recovered = (await restarted.workspaces.get(a.id))!;
    assert(recovered.input === '仅A' && recovered.status === 'interrupted' && recovered.draft !== null && recovered.activeRequestId === null, '连接重开、输入与草稿恢复、请求标中断');
    const rename = await Promise.allSettled([restarted.workspaces.rename('a', 1, '第一窗口'), restarted.workspaces.rename('a', 1, '第二窗口')]);
    assert(rename.filter(x => x.status === 'fulfilled').length === 1 && (rename.find(x => x.status === 'rejected') as PromiseRejectedResult).reason.code === 'REVISION_CONFLICT', 'CAS 并发只允许一份修改');
    const before = await restarted.record('a');
    try { await db.mutate(async tx => { await request(tx.objectStore('scripts').put({ ...before, name: '不应提交' })); await request(tx.objectStore('operations').put({ id: 'should-rollback' })); throw Error('INTENTIONAL_ABORT'); }); } catch { /* 预期拒绝 */ }
    assert(JSON.stringify(await restarted.record('a')) === JSON.stringify(before) && !(await db.get('operations', 'should-rollback')), '跨记录事务中止，原版本与日志完整');
    await restarted.workspaces.writeGm('a', [{ op: 'set', key: 'null', value: null }, { op: 'delete', key: 'keep' }]);
    const gm = await restarted.readGm('a'); assert(gm.null === null && !Object.hasOwn(gm, 'keep'), 'GM null 与删除明确区分');
    await restarted.delete('a'); await db.close(); const third = new ScriptStore(db, snapshot); await third.ready();
    assert((await third.list()).length === 0 && !(await third.workspaces.get(a.id)) && !!await third.workspaces.get(b.id), '删除关联数据且旧备份不复活，其他草稿保留');
    output.textContent += '\n\nALL PASS · 8 项真实 Chrome 网页 origin 仓储检查\n'+navigator.userAgent+'\n'+new Date().toISOString()+'\n数据库：'+db.name+'\n不代表扩展升级 UI 或 Chrome 138 验收。';
  } catch (error) { output.textContent = results.join('\n')+'\nFAIL · '+String(error); }
  finally { await db.close(); button.disabled = false; }
};
