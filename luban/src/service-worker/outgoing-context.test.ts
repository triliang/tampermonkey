import { describe, expect, it } from 'vitest';
import { describeOutgoingContext, shouldShowOutgoingElementFields } from './outgoing-context';

describe('shouldShowOutgoingElementFields', () => {
  it('整页范围不展示元素字段', () => {
    expect(shouldShowOutgoingElementFields('page')).toBe(false);
  });

  it('点选范围展示元素字段', () => {
    expect(shouldShowOutgoingElementFields('element')).toBe(true);
  });
});

describe('describeOutgoingContext scope 展示', () => {
  it('整页时 element 标签与文本为空', () => {
    const described = describeOutgoingContext({
      scope: 'page',
      meta: { url: 'https://example.com', title: 't', siteType: 'unknown' },
      target: null,
      domSummary: {
        counts: { inputs: 1, buttons: 0, forms: 0, links: 0, images: 0 },
        inputs: [],
        buttons: [],
        title: 't',
        truncated: false,
      },
    });
    expect(described.scope).toBe('page');
    expect(described.element).toEqual({ tag: '', text: '' });
  });
});
