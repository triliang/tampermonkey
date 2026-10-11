import { STORAGE_KEYS } from '../shared/constants';
import type { ScriptMeta, UserScript } from '../shared/types';
import { StorageManager } from './storage-manager';

export class ScriptStore {
  constructor(private storage = new StorageManager()) {}

  async list(): Promise<ScriptMeta[]> {
    const raw = await this.storage.get(STORAGE_KEYS.SCRIPTS_INDEX);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const meta = item as ScriptMeta;
      return { ...meta, source: meta.source === 'manual' ? 'manual' : 'ai' };
    });
  }

  async get(id: string): Promise<UserScript | null> {
    const raw = await this.storage.get(STORAGE_KEYS.script(id));
    return raw && typeof raw === 'object' ? (raw as UserScript) : null;
  }

  async save(script: UserScript): Promise<string> {
    const index = (await this.list()).filter((item) => item.id !== script.id);
    index.push({ id: script.id, name: script.name, updatedAt: script.updatedAt, source: script.source });
    await this.storage.set({
      [STORAGE_KEYS.SCRIPTS_INDEX]: index,
      [STORAGE_KEYS.script(script.id)]: script,
    });
    return script.id;
  }

  async delete(id: string): Promise<void> {
    const index = (await this.list()).filter((item) => item.id !== id);
    await this.storage.set({ [STORAGE_KEYS.SCRIPTS_INDEX]: index });
    await this.storage.remove([STORAGE_KEYS.script(id), STORAGE_KEYS.gm(id)]);
  }

  async readGm(id: string): Promise<Record<string, unknown>> {
    const raw = await this.storage.get(STORAGE_KEYS.gm(id));
    if (!raw || typeof raw !== 'object') return {};
    return { ...(raw as Record<string, unknown>) };
  }

  async writeGm(id: string, dirty: Record<string, unknown>): Promise<void> {
    const current = await this.readGm(id);
    for (const [key, value] of Object.entries(dirty)) {
      if (value === null) delete current[key];
      else current[key] = value;
    }
    await this.storage.set({ [STORAGE_KEYS.gm(id)]: current });
  }
}

let singleton: ScriptStore | null = null;

export function getScriptStore(): ScriptStore {
  if (!singleton) singleton = new ScriptStore();
  return singleton;
}

/** 当前页 URL 是否落在脚本 matches 规则的域名上。 */
export function pageMatchesScript(pageUrl: string, matches: string[]): boolean {
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    return false;
  }
  return matches.some((pattern) => {
    const rule = pattern.replace(/^\*:\/\//, '').replace(/\/\*.*$/, '').replace(/^\*\./, '');
    return host === rule || host.endsWith(`.${rule}`);
  });
}
