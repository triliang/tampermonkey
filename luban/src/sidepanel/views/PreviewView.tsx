import { useState } from 'preact/hooks';
import type { GenerationResult } from '../../shared/types';
import { STRINGS } from '../../shared/i18n-strings';
import { Button } from '../components/Button';
import { CodeBlock } from '../components/CodeBlock';

interface PreviewViewProps {
  result: GenerationResult;
  onRun: () => void;
  onSave: () => void;
  onRegenerate: (extraRequirement: string) => void;
  onEditIntent: () => void;
  offline?: boolean;
}

export function PreviewView({ result, onRun, onSave, onRegenerate, onEditIntent, offline }: PreviewViewProps) {
  const s = STRINGS.panel.preview;
  const blocked = result.safety.blocked;
  const lowConfidence = result.confidence < 0.6;
  const [extraRequirement, setExtraRequirement] = useState('');

  return (
    <section class="view">
      <h2>{s.heading}</h2>

      {blocked.length > 0 ? (
        <div class="field blocked">
          <label>{s.blockedHeading}</label>
          <p class="hint">{s.blockedHint}</p>
          <ul>{blocked.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      ) : null}

      <div class="field">
        <label>{s.explanationLabel}</label>
        <p>{result.explanation}</p>
      </div>

      <div class="field">
        <label>{s.codeLabel}</label>
        <CodeBlock code={result.code} language="javascript" />
      </div>

      {result.warnings.length > 0 ? (
        <div class="field warn">
          <label>{s.warningLabel}</label>
          <ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      ) : null}

      <p class="hint">
        {s.confidenceLabel}：{Math.round(result.confidence * 100)}%
        {lowConfidence ? <span class="badge badge-warn"> {s.lowConfidenceHint}</span> : null}
      </p>

      <div class="field">
        <label>{s.extraRequirementLabel}</label>
        <input
          class="intent-input"
          type="text"
          placeholder={s.extraRequirementPlaceholder}
          value={extraRequirement}
          onInput={(e) => setExtraRequirement((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="row">
        <Button label={s.run} variant="primary" onClick={onRun} disabled={!result.safety.passed} />
        <Button label={s.save} onClick={onSave} />
        <Button label={s.regenerate} onClick={() => onRegenerate(extraRequirement)} disabled={offline} />
        <Button label={s.editIntent} onClick={onEditIntent} />
      </div>
    </section>
  );
}
