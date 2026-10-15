import { GM_P0_GRANTS, STORAGE_KEYS } from '../../shared/constants';
import type { UserScript } from '../../shared/types';
import type { ScriptRecord, ScriptVersion } from '../../shared/v2-types';
import { DataError, Database, request } from './database';

export function validateLegacy(value: unknown): asserts value is UserScript {
  const s = value as UserScript | null;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !s.name.trim()
    || typeof s.code !== 'string' || !Array.isArray(s.matches) || !s.matches.every(x => typeof x === 'string')
    || !Array.isArray(s.gmGrants) || !s.gmGrants.every(x => (GM_P0_GRANTS as readonly string[]).includes(x))
    || !['document-start', 'document-end', 'idle'].includes(s.runAt)
    || !Number.isFinite(s.createdAt) || !Number.isFinite(s.updatedAt) || typeof s.enabled !== 'boolean') {
    throw new DataError('INVALID_SCRIPT', '脚本结构无效，未写入或覆盖数据。');
  }
}
export async function versionFromLegacy(s: UserScript): Promise<ScriptVersion> {
  const runAt = s.runAt === 'idle' ? 'document_idle' : s.runAt === 'document-start' ? 'document_start' : 'document_end';
  const content = JSON.stringify({ code: s.code, grants: [...s.gmGrants].sort(), runAt });
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return { versionId: crypto.randomUUID(), hash: Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''),
    code: s.code, explanation: s.explanation || s.description || '', grants: [...s.gmGrants], runAt, createdAt: s.updatedAt };
}
export async function recordFromLegacy(s: UserScript): Promise<ScriptRecord> {
  validateLegacy(s);
  const exact = s.matches.length === 1 ? /^\*:\/\/([^/*:]+)\/\*$/.exec(s.matches[0]) : null;
  return { id: s.id, schemaVersion: 2, name: s.name.trim(), host: exact?.[1] ?? null, matches: [...s.matches], needsRuleReview: !exact,
    recordRevision: 1, current: await versionFromLegacy(s), previous: null, autoRun: { desired: false, generation: 0 },
    tombstone: false, source: s.source === 'manual' ? 'manual' : 'ai', enabled: s.enabled, aiMeta: s.aiMeta,
    createdAt: s.createdAt, updatedAt: s.updatedAt };
}
export type LegacySnapshot = () => Promise<Record<string, unknown>>;
export async function migrateLegacy(db: Database, snapshot: LegacySnapshot): Promise<void> {
  if (await db.get('meta', 'legacyMigration')) return;
  const raw = await snapshot();
  // 逐键扫描，包含未进旧索引的孤立正文。Key/settings/session 绝不复制进数据库。
  const records = await Promise.all(Object.entries(raw).filter(([key]) => key.startsWith('luban:script:')).map(async ([key, value]) => {
    validateLegacy(value);
    if (key !== STORAGE_KEYS.script(value.id)) throw new DataError('INVALID_LEGACY', '旧脚本 id 与存储键不一致，迁移已停止。');
    const gm = raw[STORAGE_KEYS.gm(value.id)] ?? {};
    if (!gm || typeof gm !== 'object' || Array.isArray(gm)) throw new DataError('INVALID_LEGACY', '旧 GM 数据无效，迁移已停止。');
    return { script: await recordFromLegacy(value), gm };
  }));
  await db.mutate(async tx => {
    const meta = tx.objectStore('meta');
    if (await request(meta.get('legacyMigration'))) return;
    for (const { script, gm } of records) {
      if (!await request(tx.objectStore('scripts').get(script.id))) {
        await request(tx.objectStore('scripts').put(script));
        await request(tx.objectStore('gm').put({ id: script.id, values: gm }));
      }
    }
    await request(meta.put({ id: 'legacyMigration', schemaVersion: 2, count: records.length, completedAt: Date.now() }));
  }, true);
}
