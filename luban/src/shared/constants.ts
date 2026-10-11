// 全局常量与存储 Key 约定（对齐技术设计 §五 存储策略、§3.3 MiMo 接入、§3.4 token 预算）。
// 仅常量，零运行时副作用，可被所有上下文安全引用。

export const EXTENSION_NAME = '鲁班 Luban';

/** chrome.storage Key 前缀与构造函数（§五）。命名空间统一 `luban:`。 */
export const STORAGE_KEYS = {
  /** 脚本列表索引（仅 id/name/updatedAt，轻量读多写少） */
  SCRIPTS_INDEX: 'luban:scripts_index',
  /** 单脚本完整数据 */
  script: (id: string): string => `luban:script:${id}`,
  /** API Key（base64 混淆，仅 local，不进 sync） */
  API_KEY: 'luban:apiKey',
  /** 全局非敏感设置（sync） */
  SETTINGS: 'luban:settings',
  /** UI 临时状态机（session，SW 休眠恢复） */
  UI_STATE: 'luban:uiState',
  /** 上面这条快照的写入时间，用来丢掉迟到的旧写入 */
  UI_STATE_AT: 'luban:uiStateAt',
  /** GM_* 脚本数据，每脚本隔离命名空间 */
  gm: (scriptId: string): string => `luban:gm:${scriptId}`,
  /** 站点注入兼容性缓存 */
  site: (domain: string): string => `luban:site:${domain}`,
} as const;

/** runtime Port 名称（流式与保活用，§3.3 / §七）。 */
export const PORT_NAMES = {
  /** Side Panel ↔ SW：SSE 流式 delta + 保活长连接 */
  GENERATION: 'luban:port:generation',
} as const;

/** 超时与重试（§四 错误处理）。 */
export const TIMING = {
  /** AI 生成整体超时 */
  AI_TIMEOUT_MS: 60_000,
  /** MAIN world 注入回执等待（Phase 0 实测值） */
  MAIN_INJECT_WAIT_MS: 800,
  /** 超时后指数退避首次重试等待 */
  RETRY_BACKOFF_MS: 2_000,
  /** 429 限流默认等待（无 Retry-After 时） */
  RATE_LIMIT_WAIT_MS: 30_000,
  /** in-flight 状态写入 session 周期 */
  SESSION_SNAPSHOT_MS: 5_000,
  /** Provider 配置内存缓存 TTL */
  PROVIDER_CACHE_TTL_MS: 30_000,
} as const;

/** Token 预算（§3.4，总 ≤ 8K）。 */
export const TOKEN_BUDGET = {
  total: 8_000,
  system: 1_200,
  response: 2_000,
  user: 4_800,
} as const;

/** 上下文采集限流（§3.2 Phase 2）。 */
export const CONTEXT_LIMITS = {
  maxInputs: 20,
  maxButtons: 15,
  maxDepth: 8,
  selectorCandidatesPerElement: 4,
} as const;

/** URL 脱敏需剔除的参数关键字（§3.2 Phase 3）。 */
export const SENSITIVE_URL_PARAMS = ['token', 'session', 'auth', 'key', 'secret'] as const;

/** GM_* P0 白名单（§3.6，超范围打桩为 no-op）。 */
export const GM_P0_GRANTS = [
  'GM_addStyle',
  'GM_setValue',
  'GM_getValue',
  'GM_deleteValue',
  'GM_info',
  'unsafeWindow',
] as const;

export type GmP0Grant = (typeof GM_P0_GRANTS)[number];

/** 小米 MiMo 接入参数（Token Plan 为准，§八 host_permissions）。 */
export const MIMO = {
  endpoints: {
    tokenPlanCn: 'https://token-plan-cn.xiaomimimo.com/v1',
    tokenPlanSgp: 'https://token-plan-sgp.xiaomimimo.com/v1',
    tokenPlanAms: 'https://token-plan-ams.xiaomimimo.com/v1',
    /** 按量付费（发布期备选） */
    onDemand: 'https://api.xiaomimimo.com/v1',
  },
  /** Key 前缀 → 计费类型校验（§3.3 Key 校验） */
  keyPrefix: {
    tokenPlan: ['tp-', 'ttp-'] as const,
    onDemand: ['sk-'] as const,
  },
  /** 真实模型 ID（PRD 附录 B.2），曾误写为无版本号的 mimo-flash/mimo-pro 导致服务端 400 Unsupported model。 */
  models: {
    flash: 'mimo-v2.6-flash',
    pro: 'mimo-v2.6-pro',
  },
} as const;
