import { useState } from 'preact/hooks';
import type { ErrorAction } from '../../shared/errors';
import type { PageContext, TargetElement } from '../../shared/types';
import { STRINGS } from '../../shared/i18n-strings';
import { describeOutgoingContext } from '../../service-worker/prompt-builder';
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

function formatSummaryCounts(counts: { inputs: number; buttons: number; forms: number; links: number; images: number }) {
  return `输入框 ${counts.inputs} · 按钮 ${counts.buttons} · 表单 ${counts.forms} · 链接 ${counts.links} · 图片 ${counts.images}`;
}

export function IntentView({ element, intent, error, errorActions, offline, pageContext, onSubmit, onReselect, onOpenSettings }: IntentViewProps) {
  const s = STRINGS.panel.intent;
  const o = s.outgoing;
  const [draft, setDraft] = useState(intent);
  const outgoing = pageContext ? describeOutgoingContext(pageContext) : null;

  return (
    <section class="view">
      <h2>{s.heading}</h2>
      <div class="target-summary">
        <code>{element.tag}</code>
        {element.selectorCandidates[0] ? <code class="sel">{element.selectorCandidates[0]}</code> : null}
      </div>
      {outgoing ? (
        <div class="outgoing-context">
          <h3>{o.heading}</h3>
          <dl class="outgoing-fields">
            <div class="field">
              <dt>{o.url}</dt>
              <dd>{outgoing.meta.url}</dd>
            </div>
            <div class="field">
              <dt>{o.title}</dt>
              <dd>{outgoing.meta.title}</dd>
            </div>
            <div class="field">
              <dt>{o.scope}</dt>
              <dd>{o.scopeElement}</dd>
            </div>
            <div class="field">
              <dt>{o.elementTag}</dt>
              <dd>
                <code>{outgoing.element.tag}</code>
              </dd>
            </div>
            <div class="field">
              <dt>{o.elementText}</dt>
              <dd>{outgoing.element.text || '—'}</dd>
            </div>
            <div class="field">
              <dt>{o.counts}</dt>
              <dd>{formatSummaryCounts(outgoing.summaryCounts)}</dd>
            </div>
          </dl>
          <p class="hint outgoing-privacy">{o.privacy}</p>
        </div>
      ) : null}
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
    </section>
  );
}
