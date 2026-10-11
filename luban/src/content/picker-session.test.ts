// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { collectPageContext } from './context-engine';
import { createPickerSession } from './picker-session';
import { isElementPickerActive } from './element-picker';

describe('整页采集与选择器隔离', () => {
  it('采集整页上下文不启动选择器', () => {
    document.body.innerHTML = '<button id="a">A</button>';
    const session = createPickerSession();
    collectPageContext();
    expect(session.getActive()).toBeNull();
    expect(isElementPickerActive()).toBe(false);
  });

  it('取消选择后 overlay 不残留', () => {
    document.body.innerHTML = '<div>page</div>';
    const session = createPickerSession();
    session.start(vi.fn(), vi.fn());
    expect(isElementPickerActive()).toBe(true);
    session.cancel();
    expect(isElementPickerActive()).toBe(false);
    collectPageContext();
    session.cancel();
    expect(isElementPickerActive()).toBe(false);
  });

  it('连续进出选择模式 10 次不残留 overlay', () => {
    document.body.innerHTML = '<p>x</p>';
    const session = createPickerSession();
    for (let i = 0; i < 10; i++) {
      session.start(vi.fn(), vi.fn());
      session.cancel();
    }
    expect(isElementPickerActive()).toBe(false);
  });
});
