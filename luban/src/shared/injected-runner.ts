// 自包含注入运行时（P5-T3 / P5-T4）。
// 用户代码必须写进脚本正文，由浏览器直接注入 MAIN world。
// 不能在页面里 new Function / eval：GitHub 等站点的 CSP 没有 unsafe-eval，会直接抛错。
// 本文件在扩展进程里只做字符串拼接；new Function 仅供单测在本进程执行同一份正文。

export interface RunPayload {
  ok: boolean;
  timedOut: boolean;
  /** GM_setValue/deleteValue 产生的增量，deleteValue 对应 key 的值为 null。 */
  dirty: Record<string, unknown>;
  /** 用户代码抛出的错误（message + 可用行号），不代表注入机制失败。 */
  scriptError?: string;
}

/** 拼出在目标页面执行的脚本表达式，求值结果为 Promise<RunPayload>。正文中不含 eval / new Function。 */
export function compileRunnerSource(
  code: string,
  gmGrants: string[],
  storageSnapshot: Record<string, unknown>,
): string {
  return (
    '(function(storageSnapshot){' +
    '"use strict";' +
    'return new Promise(function(resolve){' +
    'var grants=new Set(' + JSON.stringify(gmGrants) + ');' +
    'var store=Object.assign(Object.create(null), storageSnapshot);' +
    'var dirty=Object.create(null);' +
    'var GM_getValue,GM_setValue,GM_deleteValue,GM_addStyle,GM_info,unsafeWindow;' +
    'if(grants.has("GM_getValue")){GM_getValue=function(key,def){return key in store?store[key]:def;};}' +
    'if(grants.has("GM_setValue")){GM_setValue=function(key,value){store[key]=value;dirty[key]=value;};}' +
    'if(grants.has("GM_deleteValue")){GM_deleteValue=function(key){delete store[key];dirty[key]=null;};}' +
    'if(grants.has("GM_addStyle")){GM_addStyle=function(css){' +
    'var hash=7;for(var i=0;i<css.length;i++)hash=(hash*31+css.charCodeAt(i))|0;' +
    'var marker="luban-"+Math.abs(hash);' +
    'if(document.querySelector(\'style[data-luban-script="\'+marker+\'"]\'))return;' +
    'var style=document.createElement("style");' +
    'style.setAttribute("data-luban-script",marker);' +
    'style.textContent=css;' +
    'document.documentElement.appendChild(style);' +
    '};}' +
    'if(grants.has("GM_info")){var info={script:{name:"luban-generated"},version:"0.1.0"};GM_info=' + (/\bGM_info\s*\(/.test(code) ? 'Object.assign(function(){return info;},info)' : 'info') + ';}' +
    'if(grants.has("unsafeWindow")){unsafeWindow=window;}' +
    'var settled=false;' +
    'function finish(payload){if(settled)return;settled=true;resolve(payload);}' +
    'function describeError(err){if(err instanceof Error){var line=err.lineNumber;return line?err.message+" (行 "+line+")":err.message;}return String(err);}' +
    'var timeoutId=setTimeout(function(){finish({ok:true,timedOut:true,dirty:dirty});},10000);' +
    'try{' +
    'var result=(async function(){\n' + code + '\n})();' +
    'Promise.resolve(result).then(function(){clearTimeout(timeoutId);finish({ok:true,timedOut:false,dirty:dirty});})' +
    '.catch(function(err){clearTimeout(timeoutId);finish({ok:true,timedOut:false,dirty:dirty,scriptError:describeError(err)});});' +
    '}catch(err){clearTimeout(timeoutId);finish({ok:true,timedOut:false,dirty:dirty,scriptError:describeError(err)});}' +
    '});' +
    '})(' + JSON.stringify(storageSnapshot) + ')'
  );
}

/** 单测入口：在当前进程执行与页面注入相同的正文。扩展进程不会调用它。 */
export function lubanRunScript(
  code: string,
  gmGrantsArr: string[],
  storageSnapshot: Record<string, unknown>,
): Promise<RunPayload> {
  const source = compileRunnerSource(code, gmGrantsArr, storageSnapshot);
  return new Function('return (' + source + ')')() as Promise<RunPayload>;
}
