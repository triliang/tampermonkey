// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { generateSelectors } from './selector-generator';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('generateSelectors 回退链', () => {
  it('有 id 时首选 #id', () => {
    setBody('<div><button id="buy-btn" class="btn">买</button></div>');
    const el = document.getElementById('buy-btn')!;
    expect(generateSelectors(el)[0]).toBe('#buy-btn');
  });

  it('无 id 但有稳定 data-* 属性时命中属性选择器', () => {
    setBody('<div><button data-testid="buy">买</button></div>');
    const el = document.querySelector('[data-testid="buy"]')!;
    expect(generateSelectors(el)).toContain('[data-testid="buy"]');
  });

  it('动态 class（css-1a2b3c 等）被排除，不出现在候选中', () => {
    setBody('<div><button class="css-1a2b3c stable-cls">买</button></div>');
    const el = document.querySelector('button')!;
    const candidates = generateSelectors(el);
    for (const c of candidates) expect(c).not.toMatch(/css-1a2b3c/);
  });

  it('稳定 class 可作为候选且唯一', () => {
    setBody('<div><button class="buy-primary">买</button><button class="other">别的</button></div>');
    const el = document.querySelector('.buy-primary')!;
    expect(generateSelectors(el)).toContain('.buy-primary');
  });

  it('tag.class 组合候选在多个同 class 元素中区分', () => {
    setBody('<div><button class="row">A</button><a class="row">B</a></div>');
    const btn = document.querySelector('button.row')!;
    const candidates = generateSelectors(btn);
    expect(candidates.some((c) => c === 'button.row')).toBe(true);
  });

  it('无任何特征的深层元素经 nth-child 兜底仍唯一命中', () => {
    setBody('<div><div><div><span>x</span><span>y</span></div></div></div>');
    const spans = document.querySelectorAll('span');
    const candidates = generateSelectors(spans[1]);
    expect(candidates.length).toBeGreaterThan(0);
    const found = document.querySelectorAll(candidates[0]);
    expect(found.length).toBe(1);
    expect(found[0]).toBe(spans[1]);
  });

  it('每个候选在真实 DOM 中唯一指向目标元素', () => {
    setBody(`
      <ul>
        <li id="a">1</li>
        <li class="item">2</li>
        <li class="item">3</li>
      </ul>
    `);
    const items = document.querySelectorAll('li');
    for (const el of Array.from(items)) {
      const candidates = generateSelectors(el);
      for (const c of candidates) {
        const found = document.querySelectorAll(c);
        expect(found.length).toBe(1);
        expect(found[0]).toBe(el);
      }
    }
  });

  it('候选数组不超过配置上限（4 个）', () => {
    setBody('<div><button id="x" data-testid="x" class="stable-a stable-b">按钮</button></div>');
    const el = document.getElementById('x')!;
    expect(generateSelectors(el).length).toBeLessThanOrEqual(4);
  });

  it('候选顺序按稳健度降序：#id 优先于 class', () => {
    setBody('<div><button id="only-id" class="stable">买</button></div>');
    const el = document.getElementById('only-id')!;
    const candidates = generateSelectors(el);
    expect(candidates[0]).toBe('#only-id');
  });

  it('hash 类名（如 a1b2c3d4）被排除', () => {
    setBody('<div><button class="a1b2c3d4 keep-me">x</button></div>');
    const el = document.querySelector('button')!;
    const candidates = generateSelectors(el);
    for (const c of candidates) expect(c).not.toMatch(/a1b2c3d4/);
  });

  it('重复调用结果稳定（幂等）', () => {
    setBody('<div><button id="stable-id">x</button></div>');
    const el = document.getElementById('stable-id')!;
    expect(generateSelectors(el)).toEqual(generateSelectors(el));
  });

  it('单元素生成候选耗时 < 5ms（100 次均值）', () => {
    setBody('<div><button id="perf-id" class="perf-cls" data-testid="perf">x</button></div>');
    const el = document.getElementById('perf-id')!;
    const start = performance.now();
    for (let i = 0; i < 100; i++) generateSelectors(el);
    const avg = (performance.now() - start) / 100;
    expect(avg).toBeLessThan(5);
  });
});
