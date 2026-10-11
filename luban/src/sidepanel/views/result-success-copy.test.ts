import { describe, it, expect } from 'vitest';
import { resolveSuccessMainCopy } from './result-success-copy';

describe('resolveSuccessMainCopy', () => {
  it('优先展示 explanation', () => {
    expect(resolveSuccessMainCopy('会把价格标红', '标红价格')).toBe('会把价格标红');
  });

  it('explanation 为空时用 intent', () => {
    expect(resolveSuccessMainCopy('', '标红价格')).toBe('标红价格');
    expect(resolveSuccessMainCopy('   ', '标红价格')).toBe('标红价格');
  });

  it('去掉 explanation 首尾空白', () => {
    expect(resolveSuccessMainCopy('  说明  ', '意图')).toBe('说明');
  });
});
