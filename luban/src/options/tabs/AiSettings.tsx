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
  validateModelSettings,
  customOrigin,
  normalizeCustomUrl,
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
  const [showKey,setShowKey]=useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving,setSaving]=useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [keyError, setKeyError] = useState<string | undefined>(undefined);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      const k = await getApiKey(!!s.customEndpoint);
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
    const check = validateModelSettings(current, apiKey);
    if (!check.ok) {
      setKeyError(check.message);
      return;
    }
    setKeyError(undefined);
    setSaving(true);
    try {
      if (current.customEndpoint && !await chrome.permissions.request({origins:[customOrigin(current.customBaseUrl!)]})) throw new Error('未授权自定义端点，旧配置未切换。');
      const oldKey=await getApiKey(!!current.customEndpoint);
      await saveApiKey(apiKey, !!current.customEndpoint);
      try {await saveSettings({...current, customBaseUrl:current.customEndpoint?normalizeCustomUrl(current.customBaseUrl!):current.customBaseUrl});}
      catch(e){await saveApiKey(oldKey,!!current.customEndpoint);throw e;}

      setSavedTick((t) => t + 1);
    } catch(e) {setKeyError((e as Error).message);}finally{setSaving(false);}

  }

  async function onClearKey(): Promise<void> {
    await clearApiKey(!!current.customEndpoint);
    setApiKey('');
  }

  async function onTestConnection(): Promise<void> {
    const check = validateModelSettings(current, apiKey);
    if (!check.ok) {
      setKeyError(check.message);
      return;
    }
    setKeyError(undefined);
    try {if(current.customEndpoint&&!await chrome.permissions.request({origins:[customOrigin(current.customBaseUrl!)]})){setKeyError('未授权自定义端点，未发送请求。');return;}}catch{setKeyError('端点授权失败，请重新加载扩展后重试。');return;}
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
    <div class="ai-settings"><fieldset disabled={saving||test.status==='testing'} style={{border:0,padding:0,minWidth:0}}>
      <section><h3>推理模式</h3><label><input type="checkbox" aria-label="启用推理模式" checked={settings.thinkingEnabled!==false} onChange={e=>update({thinkingEnabled:e.currentTarget.checked})}/>启用推理模式（默认开启）</label><p class="hint">用于生成、修复和页面分析，可关闭以减少等待。仅展示处理状态，不展示内部逐字推理；是否支持由模型决定。</p></section>
      <section><h3>可选增强</h3><label><input type="checkbox" checked={!!settings.pageAnalysisEnabled} onChange={e=>update({pageAnalysisEnabled:e.currentTarget.checked})}/>启用「分析此页」</label><p class="hint">启用后仍需在侧栏主动点击并确认发送，不会在页面加载时调用模型。</p></section>
      <section><h3>模型接入</h3><label><input type="checkbox" checked={!!settings.customEndpoint} onChange={e=>{const custom=e.currentTarget.checked;update({customEndpoint:custom});void getApiKey(custom).then(setApiKey);setKeyError(undefined);setSavedTick(0);setTest({status:'idle'});}}/>启用自定义 OpenAI 兼容端点</label><p class="hint">只在点击保存或测试连接时请求该端点主机授权（Chrome 授权覆盖该主机路径和端口）。关闭后使用原 MiMo 配置及独立保存的 Key。</p></section>
      {settings.customEndpoint?<section><label>Base URL<input value={settings.customBaseUrl??''} placeholder="https://example.com/v1" onInput={e=>update({customBaseUrl:e.currentTarget.value})}/></label><label>模型名称<input value={settings.customModel??''} onInput={e=>update({customModel:e.currentTarget.value})}/></label><label>推理参数协议<select aria-label="推理参数协议" value={settings.customThinkingProtocol??'auto'} onChange={e=>update({customThinkingProtocol:e.currentTarget.value as Settings['customThinkingProtocol']})}><option value="auto">自动识别 MiMo / DeepSeek</option><option value="thinking">thinking.type（兼容服务商或代理）</option><option value="none">不发送参数，使用服务端默认</option></select></label><p class="hint">未知端点在自动模式下不发送推理参数；如支持 thinking.type，请手动选择。服务端默认模式无法保证关闭推理。协议不匹配时不会自动重试或降级。</p><p class="hint">使用 Chat Completions 协议；模型名按服务商要求填写。API Key 不限制 MiMo 前缀。</p></section>:null}
      {!settings.customEndpoint?<section>
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
      </section>:null}

      {isTokenPlan && !settings.customEndpoint && (
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

      {!settings.customEndpoint?<section>
        <h3>Base URL</h3>
        <p class="base-url">{isTokenPlan ? MIMO.endpoints[settings.endpoint === 'onDemand' ? 'tokenPlanCn' : settings.endpoint] : MIMO.endpoints.onDemand}</p>
      </section>:null}

      <section>
        <h3>{STRINGS.options.apiKey}</h3>
        {showKey?<input type="text" aria-label="API Key" value={apiKey} placeholder={settings.customEndpoint?'服务商 API Key':isTokenPlan?'tp-xxxxx 或 ttp-xxxxx':'sk-xxxxx'} onInput={e=>{setApiKey(e.currentTarget.value);setKeyError(undefined);}}/>:<input type="password" aria-label="API Key" value={apiKey} placeholder={settings.customEndpoint?'服务商 API Key':isTokenPlan?'tp-xxxxx 或 ttp-xxxxx':'sk-xxxxx'} onInput={e=>{setApiKey(e.currentTarget.value);setKeyError(undefined);}}/>}
        <button type="button" onClick={()=>setShowKey(!showKey)}>{showKey?'隐藏 Key':'显示 Key'}</button>
        {keyError && <p class="hint error">{keyError}</p>}
        <button type="button" class="link" onClick={() => void onClearKey()}>
          一键清除
        </button>
      </section>

      {!settings.customEndpoint?<section>
        <h3>{STRINGS.options.model}</h3>
        <select value={settings.defaultModel} onChange={(e) => update({ defaultModel: (e.target as HTMLSelectElement).value })}>
          <option value={MIMO.models.flash}>{MIMO.models.flash}（默认，快速低成本）</option>
          <option value={MIMO.models.pro}>{MIMO.models.pro}（复杂场景）</option>
        </select>
      </section>:null}

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
    </fieldset></div>
  );
}
