// 设置存储（PRD 附录 B.5 / §五，P3-T4）：非敏感设置存 chrome.storage.sync，
// API Key 单独存 chrome.storage.local 且 base64 混淆，两者永不混放，Key 永不进 sync。
// 纯粹围绕 chrome.storage 的读写模块，Options 页与 Service Worker 都可直接 import。

import { MIMO, STORAGE_KEYS } from './constants';
import type { BillingType, ProviderConfig, Settings, ValidationResult } from './types';

const CUSTOM_KEY = 'luban:customApiKey';

export const DEFAULT_SETTINGS: Settings = {
  thinkingEnabled:true,
  customThinkingProtocol:'auto',
  defaultModel: MIMO.models.flash,
  endpoint: 'onDemand',
  billing: 'onDemand',
  redactContext: true,
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const saved = stored[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...saved,thinkingEnabled:saved?.thinkingEnabled!==false };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

/** 读取 API Key 明文（base64 解混淆后）；未设置时返回空字符串，不区分「未设置」与「空」给调用方。 */
export async function getApiKey(custom = false): Promise<string> {
  const stored = await chrome.storage.local.get(custom ? CUSTOM_KEY : STORAGE_KEYS.API_KEY);
  const encoded = stored[custom ? CUSTOM_KEY : STORAGE_KEYS.API_KEY] as string | undefined;
  if (!encoded) return '';
  try {
    return atob(encoded);
  } catch {
    return ''; // 混淆数据损坏，视为未设置而非抛错，不阻塞用户重新填入
  }
}

export async function saveApiKey(apiKey: string, custom = false): Promise<void> {
  await chrome.storage.local.set({ [custom ? CUSTOM_KEY : STORAGE_KEYS.API_KEY]: btoa(apiKey) });
}

export async function clearApiKey(custom = false): Promise<void> {
  await chrome.storage.local.remove(custom ? CUSTOM_KEY : STORAGE_KEYS.API_KEY);
}

/** Key 前缀 ↔ 计费方式一致性校验（附录 B.5：tp-/ttp- 配 tokenPlan，sk- 配 onDemand，不可混用）。 */
export function validateKeyPrefix(apiKey: string, billing: BillingType): ValidationResult {
  if (!apiKey) return { ok: false, message: '请填入 API Key。' };
  const prefixes = MIMO.keyPrefix[billing];
  const ok = prefixes.some((p) => apiKey.startsWith(p));
  if (ok) return { ok: true };
  const expected = prefixes.join(' / ');
  return {
    ok: false,
    message: `${billing === 'tokenPlan' ? 'Token Plan' : '按量付费'} 计费方式应使用 ${expected} 开头的 Key，当前 Key 前缀不匹配。`,
  };
}

/** 由 billing 决定 Base URL：onDemand 固定走按量付费端点，tokenPlan 按用户选的集群取值。 */
export function resolveBaseUrl(settings: Settings): string {
  if (settings.customEndpoint) return normalizeCustomUrl(settings.customBaseUrl ?? '');
  if (settings.billing === 'onDemand') return MIMO.endpoints.onDemand;
  const endpoint = settings.endpoint === 'onDemand' ? 'tokenPlanCn' : settings.endpoint;
  return MIMO.endpoints[endpoint];
}

/** 组装 ai-client 可直接使用的 ProviderConfig。 */
export function toProviderConfig(settings: Settings, apiKey: string): ProviderConfig {
  return {
    id: 'openai-compatible',
    thinkingEnabled:settings.thinkingEnabled!==false,
    thinkingProtocol:settings.customThinkingProtocol??'auto',
    baseUrl: resolveBaseUrl(settings),
    apiKey,
    model: settings.customEndpoint ? settings.customModel!.trim() : settings.defaultModel,
    customEndpoint: settings.customEndpoint,
    billing: settings.billing,
    timeoutMs: settings.timeoutMs,
  };
}


export function normalizeCustomUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('请输入有效的 HTTP/HTTPS Base URL。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Base URL 仅支持 HTTP/HTTPS，不能包含凭据、查询参数或片段。');
  if (/\/chat\/completions\/?$/.test(url.pathname)) throw new Error('请输入 Base URL，不要包含 /chat/completions。');
  return url.href.replace(/\/+$/, '');
}
export function customOrigin(raw: string): string { const url=new URL(normalizeCustomUrl(raw));return `${url.protocol}//${url.hostname}/*`; }
export function validateModelSettings(settings: Settings, key: string): ValidationResult {
  if (!settings.customEndpoint) return validateKeyPrefix(key, settings.billing);
  try { normalizeCustomUrl(settings.customBaseUrl ?? ''); } catch(e) { return {ok:false,message:(e as Error).message}; }
  if (!settings.customModel?.trim()) return {ok:false,message:'请填写自定义模型名称。'};
  if (!key.trim() || /[^\x21-\x7e]/.test(key)) return {ok:false,message:'请填写有效的 API Key（不含空白）。'};
  return {ok:true};
}

export async function saveThinkingEnabled(enabled:boolean){await saveSettings({...await getSettings(),thinkingEnabled:enabled});}
