import brandLogo from '../assets/logo.svg';
import { Privacy } from './tabs/Privacy';
import { Integrations } from './tabs/Integrations';
import { useState } from 'preact/hooks';
import { AiSettings } from './tabs/AiSettings';
import { ScriptManager } from './tabs/ScriptManager';
import { STRINGS } from '../shared/i18n-strings';

type TabId = 'ai' | 'scripts' | 'privacy' | 'integrations';

export default function App() {
  const [tab, setTab] = useState<TabId>('ai');

  return (
    <div class="options-app">
      <header class="options-header">
        <span class="brand"><img src={brandLogo} alt="" width="32" height="32"/>{STRINGS.app.name}</span>
        <span class="title">{STRINGS.options.title}</span>
      </header>
      <nav class="options-tabs">
        <button type="button" class={tab === 'integrations' ? 'active' : ''} onClick={() => setTab('integrations')}>连接与集成</button>
        <button type="button" class={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
          {STRINGS.options.aiTab}
        </button>
        <button type="button" class={tab === 'scripts' ? 'active' : ''} onClick={() => setTab('scripts')}>
          {STRINGS.options.scriptsTab}
        </button>
        <button type="button" class={tab === 'privacy' ? 'active' : ''} onClick={() => setTab('privacy')}>
          {STRINGS.options.privacyTab}
        </button>
      </nav>
      <main class="options-body">
        {tab === 'integrations' && <Integrations />}
        {tab === 'ai' && <AiSettings />}
        {tab === 'scripts' && <ScriptManager />}
        {tab === 'privacy' && <Privacy />}
      </main>
    </div>
  );
}
