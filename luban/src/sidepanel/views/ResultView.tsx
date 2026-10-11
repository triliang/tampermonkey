import { STRINGS } from '../../shared/i18n-strings';
import { Button } from '../components/Button';
import type { RunOutcome } from '../state-machine';
import { resolveSuccessMainCopy } from './result-success-copy';

interface ResultViewProps {
  outcome: RunOutcome;
  detail: unknown;
  explanation: string;
  intent: string;
  saved: boolean;
  onRunAgain: () => void;
  onSave: () => void;
  onOnce: () => void;
  onFeedback: () => void;
  onBack: () => void;
  offline?: boolean;
}

export function ResultView({ outcome, detail, explanation, intent, saved, onRunAgain, onSave, onOnce, onFeedback, onBack, offline }: ResultViewProps) {
  const s = STRINGS.panel.result;
  const heading =
    outcome === 'success'
      ? resolveSuccessMainCopy(explanation, intent) || s.success
      : outcome === 'injection_fail'
        ? s.injectionFail
        : s.runtimeError;
  return (
    <section class={`view result-${outcome}`}>
      <h2>{heading}</h2>
      {outcome !== 'success' ? <pre class="detail">{String(detail ?? '')}</pre> : null}
      <div class="row">
        {outcome === 'success' ? (
          <>
            <Button label={s.runAgain} variant="primary" onClick={onRunAgain} />
            <Button label={saved ? s.saved : s.save} onClick={onSave} disabled={saved} />
            <Button label={s.once} onClick={onOnce} />
          </>
        ) : (
          <Button label={s.feedback} variant="primary" onClick={onFeedback} disabled={offline} />
        )}
        <Button label={s.backToIdle} onClick={onBack} />
      </div>
    </section>
  );
}
