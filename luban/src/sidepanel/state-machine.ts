// Side Panel 交互状态机（纯函数 reducer，可测试、可追溯，§3.9 / PRD §8.3）。
// GENERATING / PREVIEW / RESULT 需回到 INTENT_INPUT，故携带 element+intent 上下文。

import type { ErrorAction } from '../shared/errors';
import type { GenerationResult, TargetElement } from '../shared/types';

export type RunOutcome = 'success' | 'injection_fail' | 'runtime_error';

export type UIState =
  | { type: 'IDLE' }
  | { type: 'PICKING' }
  | { type: 'INTENT_INPUT'; element: TargetElement | null; intent: string; error?: string; errorActions?: ErrorAction[] }
  | { type: 'GENERATING'; startTime: number; streamContent: string; element: TargetElement | null; intent: string }
  | { type: 'PREVIEW'; result: GenerationResult; element: TargetElement | null; intent: string }
  | { type: 'RESULT'; outcome: RunOutcome; detail: unknown; element: TargetElement | null; intent: string };

export const EMPTY_TARGET_ELEMENT: TargetElement = {
  selectorCandidates: [],
  tag: '',
  text: '',
  attributes: {},
  contextPath: '',
  siblings: [],
};

export type UIAction =
  | { type: 'START_PICK' }
  | { type: 'START_PAGE_DESCRIBE' }
  | { type: 'CANCEL_PICK' }
  | { type: 'ELEMENT_PICKED'; element: TargetElement }
  | { type: 'SUBMIT_INTENT'; intent: string }
  | { type: 'PROGRESS'; content: string }
  | { type: 'GENERATED'; result: GenerationResult }
  | { type: 'GEN_FAILED'; error: string; actions?: ErrorAction[] }
  | { type: 'CANCEL_GEN' }
  | { type: 'RUN_DONE'; outcome: RunOutcome; detail: unknown }
  | { type: 'SHOW_RESULT'; outcome: RunOutcome; detail: unknown; element: TargetElement | null; intent: string }
  | { type: 'EDIT_INTENT' }
  | { type: 'FEEDBACK' }
  | { type: 'REGENERATE' }
  | { type: 'HYDRATE'; state: UIState }
  | { type: 'BACK_TO_IDLE' };

export const initialState: UIState = { type: 'IDLE' };

/** 纯 reducer：非法/不匹配迁移返回原状态（保证不静默错乱）。 */
export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'START_PICK':
      return state.type === 'IDLE' || state.type === 'INTENT_INPUT' ? { type: 'PICKING' } : state;

    case 'START_PAGE_DESCRIBE':
      return state.type === 'IDLE'
        ? { type: 'INTENT_INPUT', element: null, intent: '' }
        : state;

    case 'CANCEL_PICK':
      return state.type === 'PICKING' ? { type: 'IDLE' } : state;

    case 'ELEMENT_PICKED':
      return state.type === 'PICKING'
        ? { type: 'INTENT_INPUT', element: action.element, intent: '' }
        : state;

    case 'SUBMIT_INTENT':
      return state.type === 'INTENT_INPUT' || state.type === 'PREVIEW' || state.type === 'RESULT'
        ? {
            type: 'GENERATING',
            startTime: Date.now(),
            streamContent: '',
            element: state.element,
            intent: action.intent,
          }
        : state;

    case 'PROGRESS':
      return state.type === 'GENERATING' ? { ...state, streamContent: action.content } : state;

    case 'GENERATED':
      return state.type === 'GENERATING'
        ? { type: 'PREVIEW', result: action.result, element: state.element, intent: state.intent }
        : state;

    case 'GEN_FAILED':
      return state.type === 'GENERATING'
        ? { type: 'INTENT_INPUT', element: state.element, intent: state.intent, error: action.error, errorActions: action.actions }
        : state;

    // 取消生成需回到 INTENT_INPUT 并保留原意图，不丢用户已填写的内容（P4-T4 验收 ③）。
    case 'CANCEL_GEN':
      return state.type === 'GENERATING' ? { type: 'INTENT_INPUT', element: state.element, intent: state.intent } : state;

    case 'RUN_DONE':
      return state.type === 'PREVIEW'
        ? { type: 'RESULT', outcome: action.outcome, detail: action.detail, element: state.element, intent: state.intent }
        : state;

    case 'SHOW_RESULT':
      return { type: 'RESULT', outcome: action.outcome, detail: action.detail, element: action.element, intent: action.intent };

    case 'FEEDBACK':
      return state.type === 'RESULT'
        ? {
            type: 'INTENT_INPUT',
            element: state.element,
            intent: `${state.intent}\n${String(state.detail ?? '')}`.trim(),
            error: String(state.detail ?? ''),
          }
        : state;

    case 'HYDRATE':
      return action.state;

    case 'EDIT_INTENT':
      return state.type === 'PREVIEW'
        ? { type: 'INTENT_INPUT', element: state.element, intent: state.intent }
        : state;

    case 'REGENERATE':
      if (state.type === 'PREVIEW' || state.type === 'RESULT') {
        return { type: 'GENERATING', startTime: Date.now(), streamContent: '', element: state.element, intent: state.intent };
      }
      return state;

    case 'BACK_TO_IDLE':
      return state.type === 'PREVIEW' || state.type === 'RESULT' ? { type: 'IDLE' } : state;

    default:
      return state;
  }
}
