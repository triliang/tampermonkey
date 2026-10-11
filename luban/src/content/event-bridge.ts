// 跨世界桥（P5-T2）：Method 2/3（<script> 标签 / Blob URL）注入的代码运行在页面真实 MAIN world，
// 该上下文没有 chrome.* API，无法直接把结果传回扩展——用一次性随机事件名的 CustomEvent 作为单向回传通道
// （事件名含 crypto.randomUUID，页面脚本猜不到，构造不出有效消息）。
// Method 1（executeScript world:MAIN）走的是另一条路径：Chrome 直接把 func 的返回值带回调用方，不需要本桥。

import { compileRunnerSource } from '../shared/injected-runner';
import type { RunPayload } from '../shared/injected-runner';

const BRIDGE_TIMEOUT_MS = 15_000;

export function runViaScriptTag(
  method: 2 | 3,
  code: string,
  gmGrants: string[],
  storageSnapshot: Record<string, unknown>,
): Promise<RunPayload> {
  return new Promise((resolve, reject) => {
    const resultEvent = `__luban_result_${crypto.randomUUID()}`;
    let settled = false;

    function cleanup(): void {
      document.removeEventListener(resultEvent, onResult as EventListener);
      document.removeEventListener('securitypolicyviolation', onCspViolation);
      clearTimeout(timeoutId);
    }

    function onResult(e: CustomEvent<RunPayload>): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(e.detail);
    }

    // CSP 拦截内联 <script> 不会触发其 error 事件（规范层面是「静默不执行」），
    // 只能靠 securitypolicyviolation 事件判定——命中后不必等满 15s 超时，直接判失败走降级。
    function onCspViolation(e: SecurityPolicyViolationEvent): void {
      if (settled || e.violatedDirective.indexOf('script-src') === -1) return;
      settled = true;
      cleanup();
      reject(new Error(`CSP 阻止了脚本注入（${e.violatedDirective}）`));
    }

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('bridge timeout：15s 内未收到页面回执'));
    }, BRIDGE_TIMEOUT_MS);

    document.addEventListener(resultEvent, onResult as EventListener);
    document.addEventListener('securitypolicyviolation', onCspViolation);

    const runnerSrc = buildRunnerSource(resultEvent, code, gmGrants, storageSnapshot);

    try {
      if (method === 2) {
        const script = document.createElement('script');
        script.textContent = runnerSrc;
        document.documentElement.appendChild(script);
        script.remove();
      } else {
        const blob = new Blob([runnerSrc], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
          script.remove();
          URL.revokeObjectURL(url);
        };
        script.onerror = () => {
          script.remove();
          URL.revokeObjectURL(url);
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Blob URL 脚本加载失败（可能被 CSP 的 script-src 拦截，不允许 blob:）'));
        };
        document.documentElement.appendChild(script);
      }
    } catch (e) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  });
}

function buildRunnerSource(
  resultEvent: string,
  code: string,
  gmGrants: string[],
  storageSnapshot: Record<string, unknown>,
): string {
  return (
    compileRunnerSource(code, gmGrants, storageSnapshot) +
    `.then(function(r){document.dispatchEvent(new CustomEvent(${JSON.stringify(resultEvent)}, {detail: r}));})` +
    `.catch(function(e){document.dispatchEvent(new CustomEvent(${JSON.stringify(resultEvent)}, {detail: {ok:false,timedOut:false,dirty:{},scriptError:String(e)}}));});`
  );
}
