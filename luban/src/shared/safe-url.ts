import { SENSITIVE_URL_PARAMS } from './constants';
export function sanitizePageUrl(value: string, base?: string): string {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.username = ''; url.password = ''; url.hash = '';
    for (const key of [...url.searchParams.keys()]) if ((SENSITIVE_URL_PARAMS as readonly string[]).includes(key.toLowerCase())) url.searchParams.delete(key);
    return url.toString();
  } catch { return ''; }
}
