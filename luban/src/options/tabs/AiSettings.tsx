// AI 设置 Tab（P3-T4）：计费方式切换、集群选择、Key 输入（混淆存 local）、
// 前缀校验、测试连接、模型选择、超时配置。保存/回显均走 settings-store.ts。

import { useEffect, useState } from 'preact/hooks';
import {
  clearApiKey,
  getApiKey,
  getSettings,
  saveApiKey,
  saveSettings,
  toProviderConfig,
  validateKeyPrefix,
} from '../../shared/settings-store';
import { MIMO, TIMING } from '../../shared/constants';
import type { BillingType, Settings } from '../../shared/types';
import { makeRequestId } from '../../shared/messages';
import { sendToSW } from '../comms';
import { STRINGS } from '../../shared/i18n-strings';

const CLUSTER_OPTIONS: { value: 'tokenPlanCn' | 'tokenPlanSgp' | 'tokenPlanAms'; label: string }[] = [
  { value: 'tokenPlanCn', label: '中国（token-plan-cn）' },
  { value: 'tokenPlanSgp', label: '新加坡（token-plan-sgp）' },
  { value: 'tokenPlanAms', label: '欧洲（token-plan-ams）' },
];

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; latencyMs?: number; message?: string };

export function AiSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const [keyError, setKeyError] = useState<string | undefined>(undefined);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => {
    void (async () => {
      const [s, k] = await Promise.all([getSettings(), getApiKey()]);
      setSettings(s);
      setApiKey(k);
    })();
  }, []);

  if (!settings) return <p class="muted">加载中…</p>;
  const current: Settings = settings; // 供闭包内使用的非空快照，闭包无法沿用 if-guard 的窄化

  function update(patch: Partial<Settings>): void {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function onBillingChange(billing: BillingType): void {
    update({ billing, endpoint: billing === 'onDemand' ? 'onDemand' : 'tokenPlanCn' });
    setKeyError(undefined);
  }

  async function onSave(): Promise<void> {
    const check = validateKeyPrefix(apiKey, current.billing);
    if (!check.ok) {
      setKeyError(check.message);
      return;
    }
    setKeyError(undefined);
    await saveSettings(current);
    await saveApiKey(apiKey);
    setSavedTick((t) => t + 1);
  }

  async function onClearKey(): Promise<void> {
    await clearApiKey();
    setApiKey('');
  }

  async function onTestConnection(): Promise<void> {
    const check = validateKeyPrefix(apiKey, current.billing);
    if (!check.ok) {
      setKeyError(check.message);
      return;
    }
    setKeyError(undefined);
    setTest({ status: 'testing' });
    const res = await sendToSW<{ latencyMs: number }>({
      type: 'TEST_CONNECTION',
      requestId: makeRequestId(),
      config: toProviderConfig(current, apiKey),
    });
    if (res.ok) setTest({ status: 'ok', latencyMs: res.data.latencyMs });
    else setTest({ status: 'fail', message: res.error.message });
  }

  const isTokenPlan = settings.billing === 'tokenPlan';

  return (
    <div class="ai-settings">
      <section>
        <h3>计费方式</h3>
        <div class="radio-row">
          <label>
            <input type="radio" checked={!isTokenPlan} onChange={() => onBillingChange('onDemand')} />
            按量付费（<code>sk-</code>）
          </label>
          <label>
            <input type="radio" checked={isTokenPlan} onChange={() => onBillingChange('tokenPlan')} />
            Token Plan 订阅（<code>tp-</code> / <code>ttp-</code>）
          </label>
        </div>
        {isTokenPlan ? (
          <p class="hint warning">
            ⚠️ Token Plan 官方条款限定仅用于编程工具，正式对外发布建议改用按量付费 Key（详见 PRD 附录 B.6）。
          </p>
        ) : (
          <p class="hint">按实际 token 用量计费，无场景限制，适合正式发布。</p>
        )}
      </section>

      {isTokenPlan && (
        <section>
          <h3>接入集群</h3>
          <select
            value={settings.endpoint}
            onChange={(e) => update({ endpoint: (e.target as HTMLSelectElement).value as Settings['endpoint'] })}
          >
            {CLUSTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </section>
      )}

      <section>
        <h3>Base URL</h3>
        <p class="base-url">{isTokenPlan ? MIMO.endpoints[settings.endpoint === 'onDemand' ? 'tokenPlanCn' : settings.endpoint] : MIMO.endpoints.onDemand}</p>
      </section>

      <section>
        <h3>{STRINGS.options.apiKey}</h3>
        <input
          type="password"
          value={apiKey}
          placeholder={isTokenPlan ? 'tp-xxxxx 或 ttp-xxxxx' : 'sk-xxxxx'}
          onInput={(e) => {
            setApiKey((e.target as HTMLInputElement).value);
            setKeyError(undefined);
          }}
        />
        {keyError && <p class="hint error">{keyError}</p>}
        <button type="button" class="link" onClick={() => void onClearKey()}>
          一键清除
        </button>
      </section>

      <section>
        <h3>{STRINGS.options.model}</h3>
        <select value={settings.defaultModel} onChange={(e) => update({ defaultModel: (e.target as HTMLSelectElement).value })}>
          <option value={MIMO.models.flash}>{MIMO.models.flash}（默认，快速低成本）</option>
          <option value={MIMO.models.pro}>{MIMO.models.pro}（复杂场景）</option>
        </select>
      </section>

      <section>
        <h3>超时（毫秒）</h3>
        <input
          type="number"
          min={5000}
          step={1000}
          value={settings.timeoutMs ?? TIMING.AI_TIMEOUT_MS}
          onInput={(e) => update({ timeoutMs: Number((e.target as HTMLInputElement).value) })}
        />
      </section>

      <section class="actions">
        <button type="button" onClick={() => void onSave()}>
          {STRINGS.options.save}
        </button>
        <button type="button" onClick={() => void onTestConnection()} disabled={test.status === 'testing'}>
          {test.status === 'testing' ? STRINGS.options.testing : STRINGS.options.testConnection}
        </button>
        {savedTick > 0 && <span class="hint ok">{STRINGS.options.saved}</span>}
        {test.status === 'ok' && (
          <span class="hint ok">
            {STRINGS.options.testOk}（{test.latencyMs}ms）
          </span>
        )}
        {test.status === 'fail' && (
          <span class="hint error">
            {STRINGS.options.testFail}：{test.message}
          </span>
        )}
      </section>
    </div>
  );
}
