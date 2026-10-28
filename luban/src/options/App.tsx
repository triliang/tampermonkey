import brandLogo from '../assets/logo.svg';
import { Privacy } from './tabs/Privacy';
import { Integrations } from './tabs/Integrations';
import { useState } from 'preact/hooks';
import { AiSettings } from './tabs/AiSettings';
import { ScriptManager } from './tabs/ScriptManager';
import { STRINGS } from '../shared/i18n-strings';

type TabId = 'overview' | 'ai' | 'scripts' | 'privacy' | 'integrations';

export default function App() {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div class="options-app">
      <header class="options-header">
        <span class="brand"><img src={brandLogo} alt="" width="32" height="32"/>{STRINGS.app.name}</span>
        <span class="title">{STRINGS.options.title}</span>
      </header>
      <nav class="options-tabs"><button type="button" class={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>概览</button>
        <button type="button" class={tab === 'integrations' ? 'active' : ''} onClick={() => setTab('integrations')}>设备与外部入口</button>
        <button type="button" class={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
          模型与服务
        </button>
        <button type="button" class={tab === 'scripts' ? 'active' : ''} onClick={() => setTab('scripts')}>
          {STRINGS.options.scriptsTab}
        </button>
        <button type="button" class={tab === 'privacy' ? 'active' : ''} onClick={() => setTab('privacy')}>
          {STRINGS.options.privacyTab}
        </button>
      </nav>
      <main class="options-body">
        {tab==='overview'?<section class="settings-overview"><h2>你的鲁班，如何工作</h2><p>选择要管理的服务，连接状态与模型可用性分别核对。</p><div class="settings-service-grid"><button onClick={()=>setTab('ai')}><strong>模型与服务 →</strong><p>管理当前模型、凭据与连接测试</p><small>保存配置和测试可用性分别反馈</small></button><button onClick={()=>setTab('integrations')}><strong>设备与连接 →</strong><p>查看本机服务、配对与已有外部入口</p><small>本机连接不等于模型可用</small></button></div><p>原有配置保留，不会因打开设置而重置、测试或运行脚本。</p></section>:null}

        {tab === 'integrations' && <Integrations />}
        {tab === 'ai' && <AiSettings />}
        {tab === 'scripts' && <ScriptManager />}
        {tab === 'privacy' && <Privacy />}
      </main>
    </div>
  );
}
