// 中文文案集中管理（产品决策：MVP 仅中文）。UI 一律从此取字符串，避免散落的硬编码。
// key 采用 `分组.名称`；后续若接 i18n，只需替换本文件的实现。

export const STRINGS = {
  app: {
    name: '鲁班 Luban',
    tagline: '说出意图，工具即成',
  },
  panel: {
    title: '鲁班',
    idle: {
      heading: '准备好帮你自动化这个页面了',
      startPick: '开始选择元素',
      hint: '先在页面上点选一个你想操作的目标元素',
      restricted: '当前页面无法使用（浏览器限制）',
      recent: '最近脚本',
      recentEmpty: '还没有保存的脚本',
    },
    picking: {
      heading: '请在页面上点选目标元素…',
      cancel: '取消选择',
    },
    intent: {
      heading: '你想对这个元素做什么？',
      placeholder: '例如：把价格低于 100 的商品标成红色',
      generate: '生成脚本',
      repick: '重新选择',
      openSettings: '打开设置',
      empty: '请先描述你的意图',
      outgoing: {
        heading: '将发送给 AI 的信息',
        url: '页面地址',
        title: '页面标题',
        scope: '范围',
        scopeElement: '选中的元素',
        elementTag: '元素标签',
        elementText: '元素文本',
        counts: '页面摘要数量',
        privacy: '不会发送：密码、Cookie、localStorage',
      },
    },
    generating: {
      heading: '正在生成脚本…',
      cancel: '取消',
    },
    preview: {
      heading: '生成的脚本',
      run: '运行',
      save: '保存',
      regenerate: '重新生成',
      editIntent: '修改意图',
      explanationLabel: '说明',
      codeLabel: '代码',
      warningLabel: '安全提示',
      confidenceLabel: '置信度',
      lowConfidenceHint: '置信度较低，建议重新生成',
      blockedHeading: '包含被禁止的操作',
      blockedHint: '以下操作已被安全扫描拦截，无法运行，请重新生成',
      extraRequirementLabel: '补充要求（重新生成时会带给 AI，可留空）',
      extraRequirementPlaceholder: '例如：同时隐藏按钮',
    },
    result: {
      success: '脚本运行成功',
      injectionFail: '脚本注入失败',
      runtimeError: '脚本运行出错',
      backToIdle: '返回',
      retry: '重试',
      runAgain: '再次运行',
      save: '保存到列表',
      saved: '已保存',
      once: '仅本次运行',
      feedback: '反馈 AI 重生成',
      expired: '生成已超时，请重试',
    },
  },
  options: {
    title: '设置',
    aiTab: 'AI 设置',
    scriptsTab: '脚本管理',
    privacyTab: '隐私与安全',
    save: '保存设置',
    saved: '已保存',
    apiKey: 'API Key',
    endpoint: '接入端点',
    model: '模型',
    testConnection: '测试连接',
    testing: '测试中…',
    testOk: '连接正常',
    testFail: '连接失败',
    scriptEmpty: '还没有保存的脚本。在侧栏运行成功后点「保存到列表」。',
    scriptRun: '在当前页运行',
    scriptDelete: '删除',
    scriptDeleteConfirm: '确定删除这个脚本？',
    sourceAi: 'AI',
    sourceManual: '手动',
  },
  toast: {
    injected: '已注入',
    pickStarted: '开始选择元素',
    copySuccess: '已复制到剪贴板',
  },
  status: {
    working: '处理中…',
    offline: '网络不可用',
  },
} as const;

/** 按 `分组.名称` 取值；找不到时返回 key 本身，便于排查。 */
export function t(key: string): string {
  const parts = key.split('.');
  let cur: unknown = STRINGS;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof cur === 'string' ? cur : key;
}
