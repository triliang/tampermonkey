import type { PageContext } from '../shared/types';

export const PAGE_DARK_MODE_INTENT = '把页面改成暗色';

export const PAGE_DARK_MODE_STUB_CODE =
  'GM_addStyle("html, body { background-color: #1a1a1a !important; color: #e0e0e0 !important; }");';

export type PageScopeStubPayload = {
  code: string;
  explanation: string;
  selectors: string[];
  gmGrants: string[];
  confidence: number;
  warnings: string[];
};

export function tryPageScopeStub(context: PageContext, intent: string): PageScopeStubPayload | null {
  if (context.scope !== 'page') return null;
  if (intent.trim() !== PAGE_DARK_MODE_INTENT) return null;
  return {
    code: PAGE_DARK_MODE_STUB_CODE,
    explanation: '为整页注入暗色背景与浅色文字样式。',
    selectors: [],
    gmGrants: ['GM_addStyle'],
    confidence: 1,
    warnings: [],
  };
}
