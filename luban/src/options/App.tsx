import { useState } from 'preact/hooks';
import { AiSettings } from './tabs/AiSettings';
import { ScriptManager } from './tabs/ScriptManager';
import { STRINGS } from '../shared/i18n-strings';

type TabId = 'ai' | 'scripts' | 'privacy';

export default function App() {
  const [tab, setTab] = useState<TabId>('ai');

  return (
    <div class="options-app">
      <header class="options-header">
        <span class="brand">{STRINGS.app.name}</span>
        <span class="title">{STRINGS.options.title}</span>
      </header>
      <nav class="options-tabs">
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
        {tab === 'ai' && <AiSettings />}
        {tab === 'scripts' && <ScriptManager />}
        {tab === 'privacy' && <p class="muted">隐私与安全设置将随后续阶段落地。</p>}
      </main>
    </div>
  );
}
