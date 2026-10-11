import { STORAGE_KEYS, TIMING } from '../shared/constants';
import type { UiSnapshot } from '../shared/types';

let writeChain: Promise<void> = Promise.resolve();

export function saveUiSnapshot(snapshot: UiSnapshot | null, updatedAt: number): Promise<void> {
  const job = writeChain.then(() => writeUiSnapshot(snapshot, updatedAt));
  writeChain = job.then(() => undefined, () => undefined);
  return job;
}

async function writeUiSnapshot(snapshot: UiSnapshot | null, updatedAt: number): Promise<void> {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.UI_STATE_AT);
  const current = stored[STORAGE_KEYS.UI_STATE_AT];
  if (typeof current === 'number' && updatedAt < current) return;
  if (!snapshot) {
    await chrome.storage.session.set({ [STORAGE_KEYS.UI_STATE_AT]: updatedAt });
    await chrome.storage.session.remove(STORAGE_KEYS.UI_STATE);
    return;
  }
  await chrome.storage.session.set({
    [STORAGE_KEYS.UI_STATE]: { ...snapshot, updatedAt },
    [STORAGE_KEYS.UI_STATE_AT]: updatedAt,
  });
}

export async function readUiSnapshot(now = Date.now()): Promise<{ snapshot: UiSnapshot | null; expired: boolean }> {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.UI_STATE);
  const snapshot = (stored[STORAGE_KEYS.UI_STATE] as UiSnapshot | undefined) ?? null;
  if (!snapshot) return { snapshot: null, expired: false };
  const expired = snapshot.phase === 'GENERATING' && now - snapshot.startedAt >= TIMING.AI_TIMEOUT_MS;
  if (expired) await chrome.storage.session.remove(STORAGE_KEYS.UI_STATE);
  return { snapshot, expired };
}
