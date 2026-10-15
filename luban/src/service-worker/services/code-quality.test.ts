import {it,expect} from 'vitest';
import {inspectCode,safeRepair} from './code-quality';
it('裸变量在执行前阻止，行号回映到正文',()=>{const r=inspectCode("'use strict';\nn;\nconsole.log(1)",[]);expect(r.passed).toBe(false);expect(r.diagnostics[0]).toMatchObject({code:'UNDEFINED_REFERENCE',line:2});expect(r.repairable).toBe(true);});
it.each([
 'const n=1;(()=>console.log(n))();',
 'const {x:n}={x:1};console.log(n);',
 'function f(a=1){return a};f();',
 'document.title="ok";window.setTimeout(()=>{},1);',
 'if(typeof optionalFeature!=="undefined")console.log("optional");',
 'await Promise.resolve(1);return;',
 'class A{method(){return 1}};new A();',
 '// GM_getValue\nconsole.log("GM_setValue")',
])('正常作用域/环境/注释不误报：%s',code=>expect(inspectCode(code,[]).passed).toBe(true));
it('typeof 后直接读取仍未定义，支持权限需明确声明',()=>{expect(inspectCode('typeof missing;missing;',[]).passed).toBe(false);expect(inspectCode('GM_getValue("k")',[]).diagnostics[0].code).toBe('MISSING_GRANT');expect(inspectCode('const get=GM_getValue;get("k")',['GM_getValue']).passed).toBe(true);});
it('语法错误、安全拦截与超量代码不会通过',()=>{expect(inspectCode('if(',[]).diagnostics[0].code).toBe('SYNTAX_ERROR');expect(inspectCode('eval("1")',[]).passed).toBe(false);expect(inspectCode(' '.repeat(256*1024+1),[]).passed).toBe(false);});
it('只自动接受裸无效引用移除，不接受扩大范围或增权',()=>{expect(safeRepair('n;document.title="A"','document.title="A"',[],[])).toBe(true);expect(safeRepair('n;document.title="A"','document.title="B"',[],[])).toBe(false);expect(safeRepair('n;','',[],['GM_getValue'])).toBe(false);});
