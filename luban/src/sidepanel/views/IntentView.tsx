import { useState } from 'preact/hooks';
import type { ErrorAction } from '../../shared/errors';
import type { PageContext, TargetElement } from '../../shared/types';
import { STRINGS } from '../../shared/i18n-strings';
import { Button } from '../components/Button';

interface IntentViewProps {
  element: TargetElement;
  intent: string;
  error?: string;
  errorActions?: ErrorAction[];
  offline?: boolean;
  pageContext: PageContext | null;
  onSubmit: (intent: string) => void;
  onReselect: () => void;
  onOpenSettings: () => void;
}

export function IntentView({ element, intent, error, errorActions, offline, pageContext, onSubmit, onReselect, onOpenSettings }: IntentViewProps) {
  const s = STRINGS.panel.intent;
  const [draft, setDraft] = useState(intent);

  return (
    <section class="view">
      <h2>{s.heading}</h2>
      <div class="target-summary">
        <code>{element.tag}</code>
        {element.selectorCandidates[0] ? <code class="sel">{element.selectorCandidates[0]}</code> : null}
      </div>
      <textarea
        class="intent-input"
        rows={4}
        placeholder={s.placeholder}
        value={draft}
        onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
      />
      {error ? <p class="error">{error}</p> : null}
      <div class="row">
        <Button label={s.generate} variant="primary" disabled={offline} onClick={() => draft.trim() && onSubmit(draft.trim())} />
        <Button label={s.repick} onClick={onReselect} />
        {errorActions?.some((a) => a.type === 'OPEN_SETTINGS') ? <Button label={s.openSettings} onClick={onOpenSettings} /> : null}
      </div>
      {!draft.trim() ? <p class="hint">{s.empty}</p> : null}
      {pageContext ? (
        <details class="context-debug">
          <summary>查看完整上下文 JSON（P2 采集结果）</summary>
          <pre>{JSON.stringify(pageContext, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}
