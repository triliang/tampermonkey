import { useEffect, useState } from 'preact/hooks';
import { sendToSW } from '../comms';
import { makeRequestId } from '../../shared/messages';
import type { InjectionResult, ScriptMeta } from '../../shared/types';
import { STRINGS } from '../../shared/i18n-strings';

export function ScriptManager() {
  const s = STRINGS.options;
  const [items, setItems] = useState<ScriptMeta[]>([]);
  const [notice, setNotice] = useState('');

  async function reload(): Promise<void> {
    const r = await sendToSW<ScriptMeta[]>({ type: 'LIST_SCRIPTS', requestId: makeRequestId() });
    if (r.ok) setItems(r.data);
    else setNotice(r.error.message);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function onRun(id: string): Promise<void> {
    const r = await sendToSW<InjectionResult>({ type: 'RUN_SAVED_SCRIPT', requestId: makeRequestId(), scriptId: id });
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    setNotice(r.data.ok ? (r.data.scriptError ?? '已在当前页运行') : (r.data.error ?? '运行失败'));
  }

  async function onDelete(id: string): Promise<void> {
    if (!window.confirm(s.scriptDeleteConfirm)) return;
    const r = await sendToSW({ type: 'DELETE_SCRIPT', requestId: makeRequestId(), scriptId: id });
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    setItems((list) => list.filter((item) => item.id !== id));
  }

  if (items.length === 0) {
    return (
      <>
        {notice ? <p class="error">{notice}</p> : null}
        <p class="hint">{s.scriptEmpty}</p>
      </>
    );
  }

  return (
    <div class="script-manager">
      {notice ? <p class="hint">{notice}</p> : null}
      <ul class="script-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span class="badge">{item.source === 'manual' ? s.sourceManual : s.sourceAi}</span>
              <span class="hint">{new Date(item.updatedAt).toLocaleString()}</span>
            </div>
            <div class="row">
              <button type="button" onClick={() => void onRun(item.id)}>{s.scriptRun}</button>
              <button type="button" onClick={() => void onDelete(item.id)}>{s.scriptDelete}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
