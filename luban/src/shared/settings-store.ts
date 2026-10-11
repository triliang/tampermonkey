// 设置存储（PRD 附录 B.5 / §五，P3-T4）：非敏感设置存 chrome.storage.sync，
// API Key 单独存 chrome.storage.local 且 base64 混淆，两者永不混放，Key 永不进 sync。
// 纯粹围绕 chrome.storage 的读写模块，Options 页与 Service Worker 都可直接 import。

import { MIMO, STORAGE_KEYS } from './constants';
import type { BillingType, ProviderConfig, Settings, ValidationResult } from './types';

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: MIMO.models.flash,
  endpoint: 'onDemand',
  billing: 'onDemand',
  redactContext: true,
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const saved = stored[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

/** 读取 API Key 明文（base64 解混淆后）；未设置时返回空字符串，不区分「未设置」与「空」给调用方。 */
export async function getApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  const encoded = stored[STORAGE_KEYS.API_KEY] as string | undefined;
  if (!encoded) return '';
  try {
    return atob(encoded);
  } catch {
    return ''; // 混淆数据损坏，视为未设置而非抛错，不阻塞用户重新填入
  }
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: btoa(apiKey) });
}

export async function clearApiKey(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.API_KEY);
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
  if (settings.billing === 'onDemand') return MIMO.endpoints.onDemand;
  const endpoint = settings.endpoint === 'onDemand' ? 'tokenPlanCn' : settings.endpoint;
  return MIMO.endpoints[endpoint];
}

/** 组装 ai-client 可直接使用的 ProviderConfig。 */
export function toProviderConfig(settings: Settings, apiKey: string): ProviderConfig {
  return {
    id: 'openai-compatible',
    baseUrl: resolveBaseUrl(settings),
    apiKey,
    model: settings.defaultModel,
    billing: settings.billing,
    timeoutMs: settings.timeoutMs,
  };
}
