import { sanitizePageUrl } from '../shared/safe-url';
import type { PageContext, PageContextScope } from '../shared/types';


export type OutgoingScope = PageContext['scope'];

export interface OutgoingContextDescription {
  scope: OutgoingScope;
  meta: PageContext['meta'];
  element: { tag: string; text: string };
  summaryCounts: PageContext['domSummary']['counts'];
}

/** 整页范围时不展示元素标签/文本字段。 */
export function shouldShowOutgoingElementFields(scope: PageContextScope): boolean {
  return scope === 'element';
}

/** 侧栏展示与 buildPayload 共用：避免两份字段清单漂移。 */
export function describeOutgoingContext(context: PageContext): OutgoingContextDescription {
  return {
    scope: context.scope,
    meta: {
      ...context.meta,
      url: sanitizePageUrl(context.meta.url),
    },
    element: context.target
      ? { tag: context.target.tag, text: context.target.text }
      : { tag: '', text: '' },
    summaryCounts: { ...context.domSummary.counts },
  };
}
