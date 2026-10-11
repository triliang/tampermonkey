import type { LubanResponse } from '../../shared/messages';
import type { ScriptMeta } from '../../shared/types';
import { STRINGS } from '../../shared/i18n-strings';
import { Button } from '../components/Button';

interface IdleViewProps {
  picking: boolean;
  recent: ScriptMeta[];
  onStartPick: () => void;
  onCancelPick: () => void;
  onSelfTest: () => void;
  onRunSaved: (script: ScriptMeta) => void;
  diag: { running: boolean; content?: LubanResponse; main?: LubanResponse };
}

function Badge({ label, res }: { label: string; res?: LubanResponse }) {
  if (!res) return <li class="diag-item"><span>{label}</span><em>—</em></li>;
  const from = res.ok ? String((res.data as { from?: string })?.from ?? '?') : '失败';
  const msg = res.ok ? `✓ ${from}` : `✗ ${res.error.message}`;
  return (
    <li class={`diag-item ${res.ok ? 'ok' : 'fail'}`}>
      <span>{label}</span>
      <em>{msg}</em>
    </li>
  );
}

export function IdleView({ picking, recent, onStartPick, onCancelPick, onSelfTest, onRunSaved, diag }: IdleViewProps) {
  const s = STRINGS.panel.idle;
  if (picking) {
    return (
      <section class="view">
        <h2>{STRINGS.panel.picking.heading}</h2>
        <Button label={STRINGS.panel.picking.cancel} onClick={onCancelPick} variant="danger" />
      </section>
    );
  }
  return (
    <section class="view">
      <h2>{s.heading}</h2>
      <p class="hint">{s.hint}</p>
      <Button label={s.startPick} onClick={onStartPick} variant="primary" />
      <h3>{s.recent}</h3>
      {recent.length === 0 ? <p class="hint">{s.recentEmpty}</p> : (
        <ul class="script-list">
          {recent.slice(0, 3).map((item) => (
            <li key={item.id}>
              <button type="button" class="script-run" onClick={() => onRunSaved(item)}>{item.name}</button>
            </li>
          ))}
        </ul>
      )}
      <hr />
      <h3>通信链路自检</h3>
      <Button label="SP → SW → CS / MAIN" onClick={onSelfTest} disabled={diag.running} />
      <ul class="diag">
        <Badge label="Content (ISOLATED)" res={diag.content} />
        <Badge label="Main (页面上下文)" res={diag.main} />
      </ul>
    </section>
  );
}
