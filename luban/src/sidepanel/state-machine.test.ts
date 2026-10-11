import { describe, it, expect } from 'vitest';
import { uiReducer, initialState, type UIState } from './state-machine';
import type { GenerationResult, TargetElement } from '../shared/types';

const element: TargetElement = {
  selectorCandidates: ['#buy-btn', 'button.buy'],
  tag: 'button',
  text: '立即购买',
  attributes: { id: 'buy-btn' },
  contextPath: 'body>div>button',
  siblings: ['span'],
};

const genResult: GenerationResult = {
  requestId: 'r1',
  code: 'console.log(1)',
  explanation: '点击按钮',
  selectors: ['#buy-btn'],
  gmGrants: [],
  confidence: 0.9,
  warnings: [],
  safety: { passed: true, blocked: [], warnings: [] },
  model: 'mimo-flash',
  tokensUsed: 100,
};

function types(seq: UIState[]): string[] {
  return seq.map((s) => s.type);
}

describe('uiReducer 主链路', () => {
  it('IDLE → PICKING → INTENT_INPUT → GENERATING → PREVIEW → RESULT', () => {
    let s = initialState;
    const path: UIState[] = [s];
    s = uiReducer(s, { type: 'START_PICK' }); path.push(s);
    expect(s.type).toBe('PICKING');
    s = uiReducer(s, { type: 'ELEMENT_PICKED', element }); path.push(s);
    expect(s.type).toBe('INTENT_INPUT');
    s = uiReducer(s, { type: 'SUBMIT_INTENT', intent: '标红' }); path.push(s);
    expect(s.type).toBe('GENERATING');
    s = uiReducer(s, { type: 'PROGRESS', content: 'partial' });
    if (s.type === 'GENERATING') expect(s.streamContent).toBe('partial');
    s = uiReducer(s, { type: 'GENERATED', result: genResult }); path.push(s);
    expect(s.type).toBe('PREVIEW');
    s = uiReducer(s, { type: 'RUN_DONE', outcome: 'success', detail: null }); path.push(s);
    expect(s.type).toBe('RESULT');
    expect(types(path)).toEqual(['IDLE', 'PICKING', 'INTENT_INPUT', 'GENERATING', 'PREVIEW', 'RESULT']);
  });
});

describe('uiReducer 分支与回退', () => {
  it('取消选择回 IDLE', () => {
    const s = uiReducer(uiReducer(initialState, { type: 'START_PICK' }), { type: 'CANCEL_PICK' });
    expect(s.type).toBe('IDLE');
  });

  it('生成失败回到 INTENT_INPUT 且带错误', () => {
    let s: UIState = { type: 'GENERATING', startTime: 0, streamContent: '', element, intent: 'x' };
    s = uiReducer(s, { type: 'GEN_FAILED', error: 'boom' });
    expect(s.type).toBe('INTENT_INPUT');
    if (s.type === 'INTENT_INPUT') expect(s.error).toBe('boom');
  });

  it('取消生成回 INTENT_INPUT 且保留原意图（P4-T4：取消不丢表单内容）', () => {
    const s = uiReducer({ type: 'GENERATING', startTime: 0, streamContent: '', element, intent: 'x' }, { type: 'CANCEL_GEN' });
    expect(s.type).toBe('INTENT_INPUT');
    expect(s.type === 'INTENT_INPUT' && s.intent).toBe('x');
  });

  it('预览态修改意图回到 INTENT_INPUT 并保留 intent', () => {
    const s = uiReducer({ type: 'PREVIEW', result: genResult, element, intent: '保留' }, { type: 'EDIT_INTENT' });
    expect(s.type).toBe('INTENT_INPUT');
    if (s.type === 'INTENT_INPUT') expect(s.intent).toBe('保留');
  });

  it('重新生成从 PREVIEW/RESULT 进入 GENERATING', () => {
    const a = uiReducer({ type: 'PREVIEW', result: genResult, element, intent: 'i' }, { type: 'REGENERATE' });
    const b = uiReducer({ type: 'RESULT', outcome: 'success', detail: null, element, intent: 'i' }, { type: 'REGENERATE' });
    expect(a.type).toBe('GENERATING');
    expect(b.type).toBe('GENERATING');
  });

  it('PREVIEW 态直接 SUBMIT_INTENT（带补充要求重新生成）也进入 GENERATING', () => {
    const s = uiReducer({ type: 'PREVIEW', result: genResult, element, intent: 'i' }, { type: 'SUBMIT_INTENT', intent: 'i' });
    expect(s.type).toBe('GENERATING');
    if (s.type === 'GENERATING') expect(s.element).toBe(element);
  });

  it('BACK_TO_IDLE 仅从 PREVIEW/RESULT 生效', () => {
    expect(uiReducer({ type: 'PREVIEW', result: genResult, element, intent: 'i' }, { type: 'BACK_TO_IDLE' }).type).toBe('IDLE');
    const idle = uiReducer(initialState, { type: 'BACK_TO_IDLE' });
    expect(idle.type).toBe('IDLE');
  });

  it('失败结果 FEEDBACK 回意图页并预填错误', () => {
    const s = uiReducer(
      { type: 'RESULT', outcome: 'runtime_error', detail: 'TypeError: x', element, intent: '点击按钮' },
      { type: 'FEEDBACK' },
    );
    expect(s.type).toBe('INTENT_INPUT');
    if (s.type === 'INTENT_INPUT') {
      expect(s.intent).toBe('点击按钮\nTypeError: x');
    }
  });
});

describe('uiReducer 非法迁移幂等', () => {
  it('IDLE 收到无关动作保持原状', () => {
    expect(uiReducer(initialState, { type: 'GENERATED', result: genResult })).toBe(initialState);
    expect(uiReducer(initialState, { type: 'RUN_DONE', outcome: 'success', detail: null })).toBe(initialState);
    expect(uiReducer(initialState, { type: 'EDIT_INTENT' })).toBe(initialState);
  });

  it('PICKING 之外的 ELEMENT_PICKED 不改状态', () => {
    expect(uiReducer(initialState, { type: 'ELEMENT_PICKED', element })).toBe(initialState);
  });
});
