import { SENSITIVE_URL_PARAMS } from '../shared/constants';
import type { PageContext } from '../shared/types';

function redactMetaUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of SENSITIVE_URL_PARAMS) {
      u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export type OutgoingScope = PageContext['scope'];

export interface OutgoingContextDescription {
  scope: OutgoingScope;
  meta: PageContext['meta'];
  element: { tag: string; text: string };
  summaryCounts: PageContext['domSummary']['counts'];
}

/** 侧栏展示与 buildPayload 共用：避免两份字段清单漂移。 */
export function describeOutgoingContext(context: PageContext): OutgoingContextDescription {
  return {
    scope: context.scope,
    meta: {
      ...context.meta,
      url: redactMetaUrl(context.meta.url),
    },
    element: context.target
      ? { tag: context.target.tag, text: context.target.text }
      : { tag: '', text: '' },
    summaryCounts: { ...context.domSummary.counts },
  };
}
