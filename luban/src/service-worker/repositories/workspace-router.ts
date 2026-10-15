import {workspaceLocked} from '../services/workspace-lock';
import type { ConversationMessage, DraftPatch } from '../../shared/v2-types';
import { DataError } from './database';
import type { ScriptStore } from '../script-store';

const PAGE_PATHS = new Set(['/src/sidepanel/index.html', '/src/options/index.html']);
export function assertExtensionPage(sender: chrome.runtime.MessageSender): void {
  let allowed = false;
  try {
    const url = new URL(sender.url ?? '');
    allowed = sender.id === chrome.runtime.id && url.protocol === 'chrome-extension:' && url.hostname === chrome.runtime.id && PAGE_PATHS.has(url.pathname);
  } catch { /* 无来源也是拒绝，不通过 sender.tab 推断 */ }
  if (!allowed) throw new DataError('FORBIDDEN_SOURCE', '此操作只允许从鲁班侧栏或设置页发起。');
}
export function isWorkspaceCommand(type: unknown): boolean {
  return typeof type === 'string' && ['CREATE_WORKSPACE', 'GET_WORKSPACE', 'LIST_WORKSPACES', 'SAVE_DRAFT', 'DISCARD_DRAFT', 'RENAME_SCRIPT'].includes(type);
}
export async function handleWorkspaceCommand(raw: unknown, sender: chrome.runtime.MessageSender, store: ScriptStore): Promise<unknown> {
  assertExtensionPage(sender);
  if (!raw || typeof raw !== 'object') throw new DataError('INVALID_MESSAGE', '消息无效。');
  const msg = raw as Record<string, unknown>;
  if (typeof msg.requestId !== 'string' || !msg.requestId) throw new DataError('INVALID_MESSAGE', '缺少请求编号。');
  await store.ready();
  const ws = store.workspaces;
  if (msg.type === 'CREATE_WORKSPACE') {
    if ((msg.scriptId !== null && typeof msg.scriptId !== 'string') || (msg.host !== null && typeof msg.host !== 'string')) throw new DataError('INVALID_MESSAGE', '网站或脚本编号无效。');
    return ws.create(msg.scriptId, msg.host);
  }
  if (msg.type === 'LIST_WORKSPACES') return ws.list();
  if (msg.type === 'RENAME_SCRIPT') {
    if (typeof msg.scriptId !== 'string' || !Number.isInteger(msg.expectedRevision) || typeof msg.name !== 'string') throw new DataError('INVALID_MESSAGE', '修改名称消息无效。');
    return ws.rename(msg.scriptId, msg.expectedRevision as number, msg.name);
  }
  if (typeof msg.workspaceId !== 'string' || !msg.workspaceId) throw new DataError('INVALID_MESSAGE', '缺少工作区编号。');
  if (msg.type === 'GET_WORKSPACE') return { workspace: await ws.get(msg.workspaceId), messages: await ws.conversation(msg.workspaceId) };
  if(workspaceLocked(msg.workspaceId))throw new DataError('WORKSPACE_BUSY','当前工作区正在处理，请等待或取消。');
  if (!Number.isInteger(msg.expectedDraftRevision)) throw new DataError('INVALID_MESSAGE', '缺少草稿版本。');
  if (msg.type === 'DISCARD_DRAFT') return ws.discard(msg.workspaceId, msg.expectedDraftRevision as number);
  if (msg.type === 'SAVE_DRAFT') return ws.saveDraft(msg.workspaceId, msg.expectedDraftRevision as number, msg.patch as DraftPatch, (msg.messages ?? []) as ConversationMessage[]);
  throw new DataError('UNKNOWN_TYPE', '未知工作区消息。');
}
