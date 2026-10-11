import { describe, expect, it, vi } from 'vitest';
import * as outgoingContext from './outgoing-context';
import {
  buildMessages,
  buildUserContent,
  describeOutgoingContext,
  estimateTokens,
  generateWithFallback,
  parseAiResponse,
} from './prompt-builder';
import { TOKEN_BUDGET } from '../shared/constants';
import type { PageContext } from '../shared/types';

function makeContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    meta: { url: 'https://example.com/item?id=1', title: '商品详情页', siteType: 'ecommerce' },
    target: {
      selectorCandidates: ['#price', '.item-price'],
      tag: 'span',
      text: '¥129.00',
      attributes: { id: 'price' },
      contextPath: 'body>div#price',
      siblings: ['span#old-price', 'button.add-cart'],
    },
    domSummary: {
      counts: { inputs: 0, buttons: 0, forms: 0, links: 0, images: 0 },
      inputs: [],
      buttons: [],
      title: '商品详情页',
      truncated: false,
    },
    ...overrides,
  };
}

const VALID_JSON_RESULT = {
  code: 'console.log(1)',
  explanation: '打印日志',
  selectors: ['#price'],
  gmGrants: [],
  confidence: 0.9,
  warnings: [],
};

function payloadFromUserContent(context: PageContext, intent: string) {
  const line = buildUserContent(context, intent).split('\n')[0];
  return JSON.parse(line) as {
    meta: PageContext['meta'];
    target: PageContext['target'];
    domSummary: PageContext['domSummary'];
  };
}

describe('describeOutgoingContext / buildPayload 同源', () => {
  it('URL 含 token 时展示与 payload 的 meta.url 均不含 token', () => {
    const context = makeContext({
      meta: { url: 'https://shop.example/item?token=secret&x=1', title: '商品详情页', siteType: 'ecommerce' },
    });
    const described = describeOutgoingContext(context);
    const payload = payloadFromUserContent(context, '意图');
    expect(described.meta.url).not.toContain('token');
    expect(payload.meta.url).toBe(described.meta.url);
    expect(payload.meta.url).not.toContain('token');
  });

  it('展示含标题、元素范围、标签文本与摘要数量', () => {
    const context = makeContext({
      domSummary: {
        counts: { inputs: 2, buttons: 3, forms: 1, links: 4, images: 5 },
        inputs: [],
        buttons: [],
        title: '商品详情页',
        truncated: false,
      },
    });
    const described = describeOutgoingContext(context);
    expect(described.scope).toBe('element');
    expect(described.meta.title).toBe('商品详情页');
    expect(described.element).toEqual({ tag: 'span', text: '¥129.00' });
    expect(described.summaryCounts).toEqual({ inputs: 2, buttons: 3, forms: 1, links: 4, images: 5 });
  });

  it('改 describeOutgoingContext 输出会同步改变 payload 对应字段', () => {
    const context = makeContext();
    const overridden = {
      scope: 'element' as const,
      meta: { url: 'https://example.com/clean', title: '覆盖标题', siteType: 'ecommerce' },
      element: { tag: 'button', text: '立即购买' },
      summaryCounts: { inputs: 9, buttons: 8, forms: 7, links: 6, images: 5 },
    };
    vi.spyOn(outgoingContext, 'describeOutgoingContext').mockReturnValue(overridden);
    const payload = payloadFromUserContent(context, '意图');
    expect(payload.meta).toEqual(overridden.meta);
    expect(payload.target.tag).toBe(overridden.element.tag);
    expect(payload.target.text).toBe(overridden.element.text);
    expect(payload.domSummary.counts).toEqual(overridden.summaryCounts);
    vi.restoreAllMocks();
  });
});

describe('estimateTokens', () => {
  it('纯中文按 1.5 token/字估算', () => {
    expect(estimateTokens('你好世界')).toBe(Math.ceil(4 * 1.5));
  });
  it('纯英文按 4 字符/token 估算', () => {
    expect(estimateTokens('abcd')).toBe(1);
  });
});

describe('buildUserContent / buildMessages', () => {
  it('真实 PageContext + 意图产出的 prompt 估算 ≤ 8K tokens', () => {
    const context = makeContext();
    const messages = buildMessages(context, '每次打开自动标红降价商品');
    const total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    expect(total).toBeLessThanOrEqual(8000);
  });

  it('800 输入框的极端 DOM 被裁剪至预算内，且 target 完整保留', () => {
    const hugeInputs = Array.from({ length: 800 }, (_, i) => `input[name=f${i}]`);
    const context = makeContext({
      domSummary: {
        counts: { inputs: 800, buttons: 0, forms: 0, links: 0, images: 0 },
        inputs: hugeInputs,
        buttons: [],
        title: '超大表单页',
        truncated: true,
      },
    });
    const content = buildUserContent(context, '帮我自动填表', TOKEN_BUDGET.user);
    expect(estimateTokens(content)).toBeLessThanOrEqual(TOKEN_BUDGET.user);
    expect(content).toContain('#price'); // target 选择器未被裁掉
  });
});

describe('parseAiResponse 容错链', () => {
  it('直接合法 JSON 可解析', () => {
    const result = parseAiResponse(JSON.stringify(VALID_JSON_RESULT));
    expect(result.ok).toBe(true);
  });

  it('Markdown 围栏包裹的 JSON 可解析', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID_JSON_RESULT) + '\n```';
    const result = parseAiResponse(wrapped);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.code).toBe('console.log(1)');
  });

  it('夹杂说明文字的杂文可用正则提取首个 JSON 对象', () => {
    const messy = `好的，这是生成的脚本：\n${JSON.stringify(VALID_JSON_RESULT)}\n希望对你有帮助！`;
    const result = parseAiResponse(messy);
    expect(result.ok).toBe(true);
  });

  it('字段缺失视为解析失败', () => {
    const result = parseAiResponse(JSON.stringify({ code: 'x' }));
    expect(result.ok).toBe(false);
  });

  it('完全非 JSON 文本视为解析失败', () => {
    const result = parseAiResponse('抱歉，我无法完成这个请求。');
    expect(result.ok).toBe(false);
  });
});

describe('generateWithFallback', () => {
  it('首轮成功直接返回，不触发第二次请求', async () => {
    const caller = { generate: vi.fn().mockResolvedValue(JSON.stringify(VALID_JSON_RESULT)) };
    const data = await generateWithFallback(caller, makeContext(), '意图', 'flash', 'pro', () => {});
    expect(data.code).toBe('console.log(1)');
    expect(caller.generate).toHaveBeenCalledTimes(1);
    expect(caller.generate).toHaveBeenCalledWith(expect.anything(), 'flash', expect.anything());
  });

  it('两次失败自动以 flash→pro 重发，第二次请求 model=pro', async () => {
    const caller = {
      generate: vi
        .fn()
        .mockResolvedValueOnce('这不是 JSON')
        .mockResolvedValueOnce(JSON.stringify(VALID_JSON_RESULT)),
    };
    const data = await generateWithFallback(caller, makeContext(), '意图', 'flash', 'pro', () => {});
    expect(data.code).toBe('console.log(1)');
    expect(caller.generate).toHaveBeenCalledTimes(2);
    expect(caller.generate).toHaveBeenNthCalledWith(2, expect.anything(), 'pro', expect.anything());
  });

  it('两轮均解析失败则抛出 modelBadJson，携带 REGENERATE/EDIT_INTENT 恢复动作', async () => {
    const caller = { generate: vi.fn().mockResolvedValue('还是不是 JSON') };
    await expect(
      generateWithFallback(caller, makeContext(), '意图', 'flash', 'pro', () => {}),
    ).rejects.toMatchObject({
      code: 'MOD_BAD_JSON',
      actions: [{ type: 'REGENERATE', withError: expect.any(String) }, { type: 'EDIT_INTENT' }],
    });
  });
});
