import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { initialState, uiReducer, type RunOutcome, type UIAction, type UIState } from './state-machine';
import { IdleView } from './views/IdleView';
import { IntentView } from './views/IntentView';
import { GeneratingView } from './views/GeneratingView';
import { PreviewView } from './views/PreviewView';
import { ResultView } from './views/ResultView';
import { sendToSW, selfTest } from './comms';
import { makeRequestId } from '../shared/messages';
import type { LubanMessage, LubanResponse, RegenerateContext } from '../shared/messages';
import { PORT_NAMES, TIMING } from '../shared/constants';
import type { InjectionResult, PageContext, ScriptMeta, TargetElement, UiSnapshot, UserScript } from '../shared/types';
import { STRINGS } from '../shared/i18n-strings';

interface Diag {
  running: boolean;
  content?: LubanResponse;
  main?: LubanResponse;
}

interface LastRun {
  scriptId?: string;
  explanation: string;
  code: string;
  gmGrants: string[];
  intent: string;
  model: string;
}

const EMPTY_ELEMENT: TargetElement = {
  selectorCandidates: [],
  tag: '',
  text: '',
  attributes: {},
  contextPath: '',
  siblings: [],
};

export default function App() {
  const [state, dispatch] = useReducer(uiReducer, initialState);
  const [diag, setDiag] = useState<Diag>({ running: false });
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [recent, setRecent] = useState<ScriptMeta[]>([]);
  const [booted, setBooted] = useState(false);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const genPortRef = useRef<chrome.runtime.Port | null>(null);
  const pageContextRef = useRef<PageContext | null>(null);
  const snapshotAt = useRef(0);
  pageContextRef.current = pageContext;

  function nextSnapshotAt(): number {
    const at = Math.max(Date.now(), snapshotAt.current + 1);
    snapshotAt.current = at;
    return at;
  }

  const go = (a: UIAction) => dispatch(a);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    function onMessage(msg: LubanMessage): void {
      if (msg.type === 'ELEMENT_PICKED') {
        setPageContext(msg.context);
        dispatch({ type: 'ELEMENT_PICKED', element: msg.context.target });
      } else if (msg.type === 'PICK_CANCELLED') {
        dispatch({ type: 'CANCEL_PICK' });
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    void (async () => {
      const r = await sendToSW<{ snapshot: UiSnapshot | null; expired: boolean }>({
        type: 'GET_STATE',
        requestId: makeRequestId(),
      });
      if (r.ok && r.data.snapshot) {
        const snap = r.data.snapshot;
        snapshotAt.current = Math.max(snapshotAt.current, snap.updatedAt);
        setPageContext(snap.pageContext);
        if (r.data.expired) {
          dispatch({
            type: 'HYDRATE',
            state: {
              type: 'INTENT_INPUT',
              element: snap.element,
              intent: snap.intent,
              error: STRINGS.panel.result.expired,
            },
          });
        } else if (snap.phase === 'PREVIEW' && snap.result) {
          dispatch({
            type: 'HYDRATE',
            state: { type: 'PREVIEW', result: snap.result, element: snap.element, intent: snap.intent },
          });
        } else if (snap.phase === 'GENERATING') {
          dispatch({
            type: 'HYDRATE',
            state: {
              type: 'GENERATING',
              startTime: snap.startedAt,
              streamContent: snap.streamContent ?? '',
              element: snap.element,
              intent: snap.intent,
            },
          });
          void connectGeneration(snap.intent, snap.pageContext ?? stubContext(''));
        }
      }
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    if (!booted || state.type !== 'GENERATING') return;
    const startedAt = state.startTime;
    const intent = state.intent;
    const element = state.element;
    const write = () => {
      const updatedAt = nextSnapshotAt();
      const snapshot: UiSnapshot = {
        phase: 'GENERATING',
        startedAt,
        updatedAt,
        intent,
        element,
        pageContext: pageContextRef.current,
      };
      void sendToSW({ type: 'SET_UI_STATE', requestId: makeRequestId(), snapshot, updatedAt });
    };
    write();
    const timer = window.setInterval(write, TIMING.SESSION_SNAPSHOT_MS);
    return () => window.clearInterval(timer);
  }, [booted, state.type, state.type === 'GENERATING' ? state.startTime : 0]);

  useEffect(() => {
    if (!booted || state.type !== 'PREVIEW') return;
    const updatedAt = nextSnapshotAt();
    const snapshot: UiSnapshot = {
      phase: 'PREVIEW',
      startedAt: updatedAt,
      updatedAt,
      intent: state.intent,
      element: state.element,
      pageContext: pageContextRef.current,
      result: state.result,
    };
    void sendToSW({ type: 'SET_UI_STATE', requestId: makeRequestId(), snapshot, updatedAt });
  }, [booted, state.type, state.type === 'PREVIEW' ? state.result.requestId : '']);

  useEffect(() => {
    if (!booted) return;
    if (state.type === 'IDLE' || state.type === 'RESULT' || state.type === 'PICKING' || state.type === 'INTENT_INPUT') {
      void sendToSW({ type: 'SET_UI_STATE', requestId: makeRequestId(), snapshot: null, updatedAt: nextSnapshotAt() });
    }
  }, [booted, state.type]);

  useEffect(() => {
    if (!booted || state.type !== 'IDLE') return;
    void refreshRecent();
  }, [booted, state.type]);

  useEffect(() => {
    if (state.type !== 'PICKING') return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') void onCancelPick();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.type]);

  async function refreshRecent(): Promise<void> {
    const r = await sendToSW<ScriptMeta[]>({ type: 'LIST_SCRIPTS', requestId: makeRequestId() });
    if (r.ok) setRecent(r.data);
  }

  async function onStartPick() {
    setNotice('');
    go({ type: 'START_PICK' });
    const r = await sendToSW({ type: 'START_PICKER', requestId: makeRequestId() });
    if (!r.ok) {
      setNotice(r.error.message);
      go({ type: 'CANCEL_PICK' });
    }
  }

  async function onCancelPick() {
    go({ type: 'CANCEL_PICK' });
    await sendToSW({ type: 'CANCEL_PICKER', requestId: makeRequestId() });
  }

  async function onSelfTest() {
    setDiag({ running: true });
    const r = await selfTest();
    setDiag({ running: false, content: r.content, main: r.main });
  }

  function connectGeneration(intent: string, context: PageContext, regenerateContext?: RegenerateContext) {
    const requestId = makeRequestId();
    const port = chrome.runtime.connect({ name: PORT_NAMES.GENERATION });
    genPortRef.current = port;
    port.onMessage.addListener((raw: LubanMessage) => {
      if (raw.type === 'GENERATION_PROGRESS') {
        dispatch({ type: 'PROGRESS', content: raw.content });
      } else if (raw.type === 'GENERATION_COMPLETE') {
        dispatch({ type: 'GENERATED', result: raw.result });
        port.disconnect();
      } else if (raw.type === 'GENERATION_FAILED') {
        dispatch({ type: 'GEN_FAILED', error: raw.error.message, actions: raw.error.actions });
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (genPortRef.current === port) genPortRef.current = null;
    });
    port.postMessage({ type: 'GENERATE_SCRIPT', requestId, context, intent, regenerateContext });
  }

  async function onSubmitIntent(intent: string, regenerateContext?: RegenerateContext) {
    if (!online) return;
    if (state.type !== 'INTENT_INPUT' && state.type !== 'PREVIEW' && state.type !== 'RESULT') return;
    const element = state.element;
    go({ type: 'SUBMIT_INTENT', intent });
    const context = pageContext ?? stubContext(element.selectorCandidates[0] ?? '');
    connectGeneration(intent, context, regenerateContext);
  }

  async function onRun() {
    if (state.type !== 'PREVIEW') return;
    const captured: LastRun = {
      code: state.result.code,
      gmGrants: state.result.gmGrants,
      explanation: state.result.explanation,
      intent: state.intent,
      model: state.result.model,
    };
    setLastRun(captured);
    const r = await sendToSW<InjectionResult>({
      type: 'INJECT_SCRIPT',
      requestId: makeRequestId(),
      code: captured.code,
      gmGrants: captured.gmGrants,
      storageSnapshot: {},
    });
    const shown = presentRun(r);
    go({ type: 'RUN_DONE', outcome: shown.outcome, detail: shown.detail });
  }

  async function onRunAgain() {
    if (!lastRun || state.type !== 'RESULT') return;
    const element = state.element;
    const intent = state.intent;
    const r = lastRun.scriptId
      ? await sendToSW<InjectionResult>({ type: 'RUN_SAVED_SCRIPT', requestId: makeRequestId(), scriptId: lastRun.scriptId })
      : await sendToSW<InjectionResult>({
          type: 'INJECT_SCRIPT',
          requestId: makeRequestId(),
          code: lastRun.code,
          gmGrants: lastRun.gmGrants,
          storageSnapshot: {},
        });
    const shown = presentRun(r);
    go({ type: 'SHOW_RESULT', outcome: shown.outcome, detail: shown.detail, element, intent });
  }

  async function onRunSaved(meta: ScriptMeta) {
    const r = await sendToSW<InjectionResult>({ type: 'RUN_SAVED_SCRIPT', requestId: makeRequestId(), scriptId: meta.id });
    const shown = presentRun(r);
    setLastRun({
      scriptId: meta.id,
      explanation: meta.name,
      code: '',
      gmGrants: [],
      intent: meta.name,
      model: '',
    });
    go({ type: 'SHOW_RESULT', outcome: shown.outcome, detail: shown.detail, element: EMPTY_ELEMENT, intent: meta.name });
  }

  async function onSave() {
    const base = state.type === 'PREVIEW'
      ? {
          code: state.result.code,
          gmGrants: state.result.gmGrants,
          explanation: state.result.explanation,
          intent: state.intent,
          model: state.result.model,
        }
      : lastRun;
    if (!base) return;
    const now = Date.now();
    const url = pageContext?.meta.url ?? '';
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    const script: UserScript = {
      id: makeRequestId(),
      name: base.intent.slice(0, 40) || '未命名脚本',
      description: base.explanation,
      explanation: base.explanation,
      code: base.code,
      matches: host ? [`*://${host}/*`] : [],
      enabled: true,
      runAt: 'document-end',
      source: 'ai',
      gmGrants: base.gmGrants,
      aiMeta: {
        intent: base.intent,
        provider: 'xiaomi-mimo',
        model: base.model,
        pageContextSnapshot: { url, title: pageContext?.meta.title ?? '' },
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    const r = await sendToSW<{ id: string }>({ type: 'SAVE_SCRIPT', requestId: makeRequestId(), script });
    if (!r.ok) {
      setNotice(r.error.message);
      return;
    }
    setNotice('');
    setLastRun({ ...base, scriptId: r.data.id });
  }

  function renderView(s: UIState) {
    switch (s.type) {
      case 'IDLE':
      case 'PICKING':
        return (
          <IdleView
            picking={s.type === 'PICKING'}
            recent={recent}
            onStartPick={onStartPick}
            onCancelPick={onCancelPick}
            onSelfTest={onSelfTest}
            onRunSaved={(meta) => void onRunSaved(meta)}
            diag={diag}
          />
        );
      case 'INTENT_INPUT':
        return (
          <IntentView
            element={s.element}
            intent={s.intent}
            error={s.error}
            errorActions={s.errorActions}
            offline={!online}
            pageContext={pageContext}
            onSubmit={onSubmitIntent}
            onReselect={onStartPick}
            onOpenSettings={() => void chrome.runtime.openOptionsPage()}
          />
        );
      case 'GENERATING':
        return (
          <GeneratingView
            streamContent={s.streamContent}
            startTime={s.startTime}
            onCancel={() => {
              go({ type: 'CANCEL_GEN' });
              void sendToSW({ type: 'CANCEL_GENERATION', requestId: makeRequestId() });
              genPortRef.current?.disconnect();
              genPortRef.current = null;
            }}
          />
        );
      case 'PREVIEW':
        return (
          <PreviewView
            result={s.result}
            onRun={() => void onRun()}
            onSave={() => void onSave()}
            onRegenerate={(extraRequirement) =>
              void onSubmitIntent(s.intent, {
                previousCode: s.result.code,
                previousWarnings: s.result.warnings,
                extraRequirement,
              })
            }
            onEditIntent={() => go({ type: 'EDIT_INTENT' })}
            offline={!online}
          />
        );
      case 'RESULT':
        return (
          <ResultView
            outcome={s.outcome}
            detail={s.detail}
            explanation={lastRun?.explanation ?? ''}
            saved={Boolean(lastRun?.scriptId)}
            onRunAgain={() => void onRunAgain()}
            onSave={() => void onSave()}
            onOnce={() => go({ type: 'BACK_TO_IDLE' })}
            onFeedback={() => go({ type: 'FEEDBACK' })}
            onBack={() => go({ type: 'BACK_TO_IDLE' })}
            offline={!online}
          />
        );
    }
  }

  if (!booted) {
    return (
      <div class="panel">
        <header class="panel-header">
          <span class="brand">{STRINGS.panel.title}</span>
        </header>
      </div>
    );
  }

  return (
    <div class="panel">
      <header class="panel-header">
        <span class="brand">{STRINGS.panel.title}</span>
        <span class="tagline">{STRINGS.app.tagline}</span>
      </header>
      <main class="panel-body">
        {!online ? <p class="offline-banner">{STRINGS.status.offline}</p> : null}
        {notice ? <p class="error">{notice}</p> : null}
        {renderView(state)}
      </main>
    </div>
  );
}

function presentRun(r: LubanResponse<InjectionResult>): { outcome: RunOutcome; detail: unknown } {
  if (!r.ok) return { outcome: 'injection_fail', detail: r.error.message };
  if (!r.data.ok) return { outcome: 'injection_fail', detail: r.data.error ?? '注入失败' };
  if (r.data.scriptError) return { outcome: 'runtime_error', detail: r.data.scriptError };
  return { outcome: 'success', detail: `Method ${r.data.method} · ${r.data.timingMs}ms` };
}

function stubContext(selector: string): PageContext {
  return {
    meta: { url: location.href, title: document.title, siteType: 'unknown' },
    target: { selectorCandidates: [selector], tag: '', text: '', attributes: {}, contextPath: '', siblings: [] },
    domSummary: { counts: { inputs: 0, buttons: 0, forms: 0, links: 0, images: 0 }, inputs: [], buttons: [], title: '', truncated: false },
  };
}
