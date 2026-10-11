// 静态安全扫描（PRD §3.8）：纯函数，对 AI 返回的代码/gmGrants 做黑名单拦截 + 白名单校验。
// 不依赖 DOM/网络，可在 Node 测试环境直接跑；10KB 代码规模下应在个位数毫秒内完成。

import { GM_P0_GRANTS, type GmP0Grant } from '../shared/constants';
import type { SafetyReport } from '../shared/types';

const GM_CALL_PATTERN = /\bGM_[A-Za-z_]+\b/g;
const COOKIE_EXFIL_SINK = /(fetch\s*\(|new\s+XMLHttpRequest\s*\(|\.send\s*\(|navigator\s*\.\s*sendBeacon\s*\()/;
const PAYMENT_KEYWORDS = /(支付宝|微信支付|信用卡|银行卡|checkout|payment|pay-now|credit[-_]?card)/i;

/** 对单段代码 + 声明的 gmGrants 做完整安全扫描。 */
export function scanCode(code: string, gmGrants: readonly string[] = []): SafetyReport {
  const blocked: string[] = [];
  const warnings: string[] = [];

  if (/\beval\s*\(/.test(code) || /\bnew\s+Function\s*\(/.test(code)) {
    blocked.push('检测到 eval 或 new Function，禁止动态执行任意代码');
  }

  if (/document\s*\.\s*cookie/.test(code) && COOKIE_EXFIL_SINK.test(code)) {
    blocked.push('检测到疑似 Cookie 外发行为（读取 document.cookie 并发往网络）');
  }

  if (/localStorage\s*\.\s*clear\s*\(/.test(code) || /indexedDB\s*\.\s*deleteDatabase\s*\(/.test(code)) {
    blocked.push('检测到清空本地存储或删除数据库的危险操作');
  }

  if (/\bfetch\s*\(/.test(code) || /new\s+XMLHttpRequest\s*\(/.test(code)) {
    warnings.push('脚本包含网络请求（fetch/XMLHttpRequest），请确认目标域名可信');
  }

  if (hasInfiniteLoopWithoutBreak(code)) {
    blocked.push('检测到可能导致死循环的代码（while(true)/for(;;) 内无 break）');
  }

  if (/__proto__/.test(code) || /constructor\s*\.\s*prototype/.test(code)) {
    warnings.push('脚本涉及原型链操作（__proto__/constructor.prototype），请人工复核');
  }

  if (PAYMENT_KEYWORDS.test(code)) {
    warnings.push('脚本涉及支付/下单相关关键词，涉及资金操作请谨慎确认后再运行');
  }

  for (const grant of gmGrants) {
    if (!isKnownGrant(grant)) {
      warnings.push(`该脚本申请了不支持的权限：${grant}，运行时将被打桩为空操作`);
    }
  }

  for (const call of new Set(code.match(GM_CALL_PATTERN) ?? [])) {
    if (!isKnownGrant(call)) {
      blocked.push(`脚本调用了不受支持的 GM API：${call}`);
    }
  }

  return { passed: blocked.length === 0, blocked, warnings };
}

function isKnownGrant(name: string): name is GmP0Grant {
  return (GM_P0_GRANTS as readonly string[]).includes(name);
}

/** 匹配 while(true)/for(;;)，提取其代码块，若块内无 break 则判定为死循环。 */
function hasInfiniteLoopWithoutBreak(code: string): boolean {
  const pattern = /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    const braceStart = code.indexOf('{', match.index + match[0].length);
    if (braceStart === -1) continue;
    const body = extractBlock(code, braceStart);
    if (!/\bbreak\b/.test(body)) return true;
  }
  return false;
}

/** 从首个 `{` 起按括号配对提取完整代码块（容忍嵌套）。 */
function extractBlock(code: string, openBraceIdx: number): string {
  let depth = 0;
  for (let i = openBraceIdx; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(openBraceIdx, i + 1);
    }
  }
  return code.slice(openBraceIdx);
}
