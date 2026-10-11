import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clearApiKey,
  getApiKey,
  getSettings,
  resolveBaseUrl,
  saveApiKey,
  saveSettings,
  toProviderConfig,
  validateKeyPrefix,
} from './settings-store';
import { STORAGE_KEYS } from './constants';
import type { Settings } from './types';

function makeStorageArea() {
  const data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => Object.assign(data, items)),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
    _data: data,
  };
}

let sync: ReturnType<typeof makeStorageArea>;
let local: ReturnType<typeof makeStorageArea>;

beforeEach(() => {
  sync = makeStorageArea();
  local = makeStorageArea();
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { sync, local } };
});

describe('settings-store', () => {
  it('getSettings 在未保存时返回默认值（新安装默认按量付费）', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.billing).toBe('onDemand');
    expect(settings.endpoint).toBe('onDemand');
    expect(resolveBaseUrl(settings)).toBe('https://api.xiaomimimo.com/v1');
  });

  it('getSettings 已保存 tokenPlan 时读回仍为 tokenPlan，不被默认值覆盖', async () => {
    const tokenPlan: Settings = {
      ...DEFAULT_SETTINGS,
      billing: 'tokenPlan',
      endpoint: 'tokenPlanSgp',
    };
    await saveSettings(tokenPlan);
    const read = await getSettings();
    expect(read.billing).toBe('tokenPlan');
    expect(read.endpoint).toBe('tokenPlanSgp');
  });

  it('saveSettings 写入 sync，getSettings 读回合并后的值', async () => {
    const custom: Settings = { ...DEFAULT_SETTINGS, defaultModel: 'mimo-v2.6-pro', billing: 'onDemand' };
    await saveSettings(custom);
    expect(sync.set).toHaveBeenCalledWith({ [STORAGE_KEYS.SETTINGS]: custom });
    const read = await getSettings();
    expect(read).toEqual(custom);
  });

  it('saveApiKey 对 Key 做 base64 混淆后存 local，不是明文', async () => {
    await saveApiKey('tp-secret-123');
    const stored = local._data[STORAGE_KEYS.API_KEY] as string;
    expect(stored).not.toBe('tp-secret-123');
    expect(stored).toBe(btoa('tp-secret-123'));
  });

  it('getApiKey 还原出明文；从未设置过时返回空字符串', async () => {
    expect(await getApiKey()).toBe('');
    await saveApiKey('tp-secret-123');
    expect(await getApiKey()).toBe('tp-secret-123');
  });

  it('clearApiKey 清除 local 中的 Key', async () => {
    await saveApiKey('tp-secret-123');
    await clearApiKey();
    expect(await getApiKey()).toBe('');
  });

  it('Key 永不写入 sync：无论调用多少次 saveApiKey，sync.set 都不包含 API_KEY', async () => {
    await saveApiKey('tp-secret-123');
    const syncCalls = sync.set.mock.calls.flatMap((args) => Object.keys(args[0] as object));
    expect(syncCalls).not.toContain(STORAGE_KEYS.API_KEY);
  });

  it('validateKeyPrefix: tp-/ttp- 配 tokenPlan 通过，sk- 配 tokenPlan 被拦截', () => {
    expect(validateKeyPrefix('tp-abc', 'tokenPlan').ok).toBe(true);
    expect(validateKeyPrefix('ttp-abc', 'tokenPlan').ok).toBe(true);
    const result = validateKeyPrefix('sk-abc', 'tokenPlan');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Token Plan');
  });

  it('validateKeyPrefix: sk- 配 onDemand 通过，tp- 配 onDemand 被拦截', () => {
    expect(validateKeyPrefix('sk-abc', 'onDemand').ok).toBe(true);
    expect(validateKeyPrefix('tp-abc', 'onDemand').ok).toBe(false);
  });

  it('resolveBaseUrl: onDemand 固定走按量付费端点，不受 endpoint 字段影响', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, billing: 'onDemand', endpoint: 'tokenPlanSgp' };
    expect(resolveBaseUrl(settings)).toBe('https://api.xiaomimimo.com/v1');
  });

  it('resolveBaseUrl: tokenPlan 按 endpoint 集群取值', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, billing: 'tokenPlan', endpoint: 'tokenPlanAms' };
    expect(resolveBaseUrl(settings)).toBe('https://token-plan-ams.xiaomimimo.com/v1');
  });

  it('toProviderConfig 组装出 ai-client 可直接使用的配置', () => {
    const config = toProviderConfig(DEFAULT_SETTINGS, 'sk-abc');
    expect(config).toMatchObject({
      apiKey: 'sk-abc',
      model: DEFAULT_SETTINGS.defaultModel,
      billing: 'onDemand',
      baseUrl: 'https://api.xiaomimimo.com/v1',
    });
  });
});
