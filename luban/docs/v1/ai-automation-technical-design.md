# 鲁班 Luban · AI 网页自动化扩展 · 概要设计

---

## 一、架构总览

采用 **"薄 Service Worker + 胖 Content Script + 独立 Side Panel"** 三层架构，三个 Chrome 执行世界（Service Worker / Isolated World / MAIN World）通过类型安全的消息协议松耦合连接。

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Worker (后台)                      │
│  消息路由 · AI 请求代理(fetch/SSE) · 存储协调 · 注入调度      │
│  安全扫描 · 状态持久化(session) · Prompt 拼装                 │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │ runtime.sendMsg  │ runtime.Port     │ scripting API
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ Content Script│  │  Side Panel  │  │  MAIN World 注入     │
│ (Isolated)   │  │  (主交互面板) │  │  GM_* 运行时+用户脚本 │
│ 上下文采集    │  │  状态机/5视图 │  │  CustomEvent 桥(MAIN) │
│ 元素选择器    │  │  流式渲染     │  └──────────────────────┘
│ CustomEvent桥 │  └──────────────┘
└──────────────┘
        ▲
    Page DOM
```

**关键技术决策：**

| 决策项 | 选择 | 理由 | 被否决替代 |
|--------|------|------|-----------|
| MVP 主注入方式 | `chrome.scripting.executeScript({world:'MAIN'})` | 浏览器级注入，**绕过页面 CSP**，~12ms | manifest 声明式 MAIN world（不支持动态脚本） |
| 跨世界通信桥 | `CustomEvent` + `crypto.randomUUID()` 密钥 | 安全、现代，页面脚本无法伪造 | `window.postMessage`（可被页面脚本截获） |
| UI 框架 | Preact (~3KB gzip) + HTM | 组件化+极小体积，`preact/compat` 可平滑迁移 React | React (40KB+); Vanilla JS (开发效率低) |
| 代码高亮 | microlighter (~2KB gzip) | 零依赖、MIT，CSS Custom Highlight API（`::highlight()`）+ TextMate 语法、零 span 注入；支持 JS/TS/JSON/HTML/CSS 等 37 种语言（按需加载）与 10+ 内置主题，自带 TS 类型声明；Chromium 105+ 原生支持，扩展仅 Chromium 无兼容负担 | CodeMirror (~140KB，MVP 仅需展示非编辑); 自研正则高亮 (维护成本高、语言覆盖不足) |
| 构建工具 | Vite + `@crxjs/vite-plugin` | MV3 HMR、自动 manifest、tree-shaking、极快 | Webpack (慢); 无构建 (不支持 TS+多入口) |
| Content Script 加载 | 按需注入 (`activeTab` + `chrome.scripting`) | 避免每页加载开销 | manifest `content_scripts` 声明式(全站加载) |
| GM_* 存储 | `chrome.storage.local` 经 SW 中转 | MV3 原生、可靠 | IndexedDB (过度); 内存 (SW 休眠丢失) |
| AI 流式 | SSE via `fetch` ReadableStream + Port 长连接推送 | 实时 UX + SW 保活 | 非流式 (8-15s 白等) |

---

## 二、项目目录结构

```
luban/
├── manifest.json                     # MV3 manifest
├── vite.config.ts                    # Vite + CRXJS 构建
├── tsconfig.json
├── package.json
├── src/
│   ├── shared/                       # 跨上下文共享（仅类型+常量，零运行时）
│   │   ├── types.ts                  # 所有 TypeScript 接口/类型
│   │   ├── messages.ts               # 消息协议类型定义（type-safe 联合类型）
│   │   ├── constants.ts              # 全局常量、枚举
│   │   ├── errors.ts                 # 5 层错误模型 + 错误工厂
│   │   └── i18n-strings.ts           # 中文文案集中管理
│   │
│   ├── service-worker/               # Service Worker 后台
│   │   ├── index.ts                  # SW 入口 + 事件注册 + 消息路由
│   │   ├── ai-client.ts             # AI Provider 适配器 + SSE 流式
│   │   ├── ai-providers/
│   │   │   ├── base.ts              # Provider 抽象接口
│   │   │   └── openai-compatible.ts # OpenAI 兼容适配器（MiMo 复用）
│   │   ├── sse-parser.ts            # 零依赖增量 SSE 解析器
│   │   ├── prompt-builder.ts        # System Prompt + 上下文拼装 + token 预算
│   │   ├── safety-scanner.ts        # 代码安全静态扫描黑名单
│   │   ├── injection-dispatcher.ts  # 注入调度 + CSP 降级链 + 站点兼容追踪
│   │   ├── script-store.ts          # 脚本 CRUD (chrome.storage.local)
│   │   ├── settings-store.ts        # 设置管理 (sync + local)
│   │   ├── storage-manager.ts       # 统一存储抽象 + 批量操作 + 内存缓存
│   │   ├── state-recovery.ts        # SW 休眠状态持久化/恢复
│   │   └── keepalive.ts             # 按需 Port 保活（仅流式期间）
│   │
│   ├── content/                      # Content Script (Isolated World)
│   │   ├── index.ts                  # 入口 + 消息桥注册
│   │   ├── context-engine.ts        # 页面上下文采集 + 脱敏 + 摘要限流
│   │   ├── selector-generator.ts    # 稳健 CSS 选择器生成（回退链）
│   │   ├── element-picker.ts        # 元素选择器 UI（悬停高亮+点击捕获）
│   │   ├── event-bridge.ts          # Isolated ↔ MAIN 世界 CustomEvent 桥
│   │   └── toast.ts                 # 页面内 Toast 浮层
│   │
│   ├── main-world/                   # MAIN World 注入脚本
│   │   ├── gm-runtime.ts            # GM_* P0 子集运行时
│   │   ├── script-executor.ts       # 用户脚本包装器 + try/catch 执行
│   │   └── bridge-shim.ts           # CustomEvent 监听器（MAIN 侧）
│   │
│   ├── sidepanel/                    # Side Panel UI (Preact)
│   │   ├── index.html
│   │   ├── index.ts
│   │   ├── App.tsx                   # 根组件
│   │   ├── state-machine.ts         # 交互状态机（纯函数 reducer）
│   │   ├── views/                    # 5 个状态视图
│   │   │   ├── IdleView.tsx
│   │   │   ├── IntentView.tsx
│   │   │   ├── GeneratingView.tsx
│   │   │   ├── PreviewView.tsx
│   │   │   └── ResultView.tsx
│   │   ├── components/               # 公共 UI 组件
│   │   └── styles/
│   │
│   ├── options/                      # Options 页
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── tabs/
│   │       ├── AiSettings.tsx
│   │       ├── ScriptManager.tsx
│   │       └── PrivacySecurity.tsx
│   │
│   └── assets/                       # 图标
│       ├── icon16.png / icon48.png / icon128.png
│
├── _locales/zh_CN/messages.json      # Chrome i18n（仅中文）
└── tests/
    ├── injection/                    # 注入 E2E（10 站点）
    ├── safety-scanner.test.ts
    ├── context-engine.test.ts
    └── ai-client.test.ts
```

---

## 三、核心子系统设计

### 3.1 消息协议 (`shared/messages.ts`)

所有跨上下文通信通过 TypeScript 联合类型约束，消除魔法字符串：

```typescript
type MessageType =
  | 'START_PICKER'           // SidePanel → SW → Content: 启动元素选择
  | 'ELEMENT_PICKED'         // Content → SW → SidePanel: 元素已选中+上下文
  | 'GENERATE_SCRIPT'        // SidePanel → SW: 请求 AI 生成
  | 'GENERATION_PROGRESS'    // SW → SidePanel (via Port): 流式 delta
  | 'GENERATION_COMPLETE'    // SW → SidePanel: 生成完成
  | 'GENERATION_FAILED'      // SW → SidePanel: 生成失败
  | 'INJECT_SCRIPT'          // SW → Content: 注入到 MAIN world
  | 'INJECT_VIA_SCRIPT_TAG'  // SW → Content: 降级注入
  | 'INJECTION_RESULT'       // Content → SW → SidePanel: 注入结果
  | 'SAVE_SCRIPT'            // SidePanel → SW: 保存脚本
  | 'RUN_SAVED_SCRIPT'       // Options → SW: 运行已保存脚本
  | 'CANCEL_GENERATION';     // SidePanel → SW: 取消生成
```

### 3.2 页面上下文引擎 (`content/context-engine.ts` + `selector-generator.ts`)

**性能目标**: 采集+脱敏+序列化 P50 < 100ms, P95 < 300ms

**两阶段采集策略**:
- **Phase 1 — 目标元素（同步，~3ms）**: tag/attributes/textContent/选择器候选链/siblings
- **Phase 2 — 页面摘要（同步，~60ms）**: 使用 `TreeWalker` API（比 `querySelectorAll` 快 2-5x），按元素类型计数，限流采集（maxInputs:20, maxButtons:15, maxDepth:8）
- **Phase 3 — 脱敏（~10ms）**: URL 去除 `token|session|auth|key|secret` 参数；不采集 `password` 值；敏感站点域名匹配

**选择器生成优先级**: `#id` → 稳定 `[data-*]` → 稳定 `.class`（排除 `css-*`/`jsx-*` 动态 class）→ `tag.class` 组合 → 父级 `nth-child`（兜底）。每元素生成 3-4 个候选，用 `querySelectorAll` 验证唯一性。

**核心接口**:
```typescript
interface PageContext {
  meta: { url: string; title: string; siteType: string };
  target: TargetElement;
  domSummary: DOMSummary;
}
interface TargetElement {
  selectorCandidates: string[];  // 按稳健度降序
  tag: string; text: string;
  attributes: Record<string, string>;
  contextPath: string; siblings: string[];
}
```

### 3.3 AI Client + Provider 适配器 (`service-worker/ai-client.ts` + `ai-providers/`)

**适配器模式**（P1 新增 Provider 只需加一个文件 + 注册一行）:

```typescript
interface AIProvider {
  readonly id: string;
  validate(config: ProviderConfig): ValidationResult;
  generateStream(request: GenerateRequest): AsyncGenerator<StreamChunk>;
  cancel(): void;
  testConnection(config: ProviderConfig): Promise<{ ok: boolean; latencyMs: number }>;
}
// OpenAI 兼容适配器（MiMo + 未来所有兼容端点复用）
class OpenAICompatibleProvider implements AIProvider { ... }
// 注册表
const providerRegistry = new Map<string, (config) => AIProvider>();
```

**SSE 流式解析** (`sse-parser.ts`): 基于 `ReadableStream` 增量解析，零外部依赖。Side Panel 通过 `chrome.runtime.Port` 长连接接收 delta（避免逐 chunk `sendMessage` 开销），用 `requestAnimationFrame` 批量更新 DOM。

**Port 保活**: 流式请求期间 Side Panel 维持一个到 SW 的 Port 长连接（防止 SW 休眠），流结束后立即断开。

**Key 校验**: 保存时按 `billing` 校验前缀（`tp-`/`ttp-` vs `sk-`），不匹配则拒绝并提示。

**错误映射**: 401→Key 无效, 403→Key 过期, 429→额度耗尽/限流, 超时→网络慢，均映射为中文可读文案+可操作恢复动作。

### 3.4 Prompt Builder (`service-worker/prompt-builder.ts`)

**职责**: 组装 System Prompt + User Message(结构化 JSON + 意图) + 输出 Schema 说明。

**Token 预算管理** (总预算 ≤ 8K tokens):
- System Prompt 固定 ~1200 tokens（安全/输出格式/选择器质量/脚本质量四类约束，中文编写）
- Response 预留 ~2000 tokens
- 可用空间 ~4800 tokens 给 user message
- **分级裁剪**: target 不裁 → intent 不裁 → domSummary 裁剪 → siblings/notes 裁剪

**Token 快速估算**: 中文 ~1.5 token/字, 英文 ~0.75 token/word

**响应解析容错链**: `JSON.parse(raw)` → 剥离 Markdown 围栏 → 正则提取首个 `{...}` → 自动重试 1 次（附「必须输出纯 JSON」强化指令）→ 切模型（flash→pro）→ 上报失败

### 3.5 脚本注入引擎 (`service-worker/injection-dispatcher.ts`)

**注入降级链**（核心：chrome.scripting MAIN world 为浏览器级注入，绕过页面 CSP）:

| 优先级 | 方法 | CSP 抗性 | 说明 |
|--------|------|---------|------|
| **1 (MVP 主路径)** | `chrome.scripting.executeScript({world:'MAIN'})` | **绕过页面 CSP** | 浏览器级注入，~12ms |
| 2 (降级) | Content Script 注入 `<script>` 标签 (textContent) | 被 `script-src` 无 `unsafe-inline` 阻止 | 同步 |
| 3 (降级) | Blob URL `<script src="blob:...">` | 被 `script-src` 无 `blob:` 阻止 | 异步 |
| 4 (终止) | 报告「该站点暂不支持」 | — | 记录至受限站点清单 |

**站点兼容性追踪**: 首次尝试记录成功/失败方法，后续访问直接使用已知可用方法，定期重试失败方法。

```typescript
interface SiteCompatibility {
  domain: string;
  lastTested: number;
  injectionMethod: 1 | 2 | 3 | 4;
  failures: { method: number; error: string; timestamp: number }[];
}
```

### 3.6 GM_* 运行时 (`main-world/gm-runtime.ts`)

**P0 子集**: `GM_addStyle`, `GM_setValue`/`GM_getValue`/`GM_deleteValue`, `GM_info`, `unsafeWindow`

**关键设计**: 「注入时预加载存储快照 + 异步回写」模式
- `GM_getValue`: 同步读取预注入的 `__luban_storage` 快照（与 Tampermonkey 行为一致）
- `GM_setValue/deleteValue`: 立即更新内存快照 + 通过 CustomEvent 桥异步回写到 Content Script → SW → `chrome.storage.local`
- `GM_addStyle`: 纯 DOM 操作，创建 `<style>` 并 append，带 `data-luban-script` 标记防重复
- `unsafeWindow`: MAIN world 中直接就是 `window`
- `GM_info`: 注入时拼装脚本元信息

**按需注入**: 仅注入用户脚本声明需要的 GM_* API（根据 `gmGrants`），减少注入代码量。

### 3.7 跨世界通信桥 (`content/event-bridge.ts` + `main-world/bridge-shim.ts`)

借鉴 Tampermonkey 的 Eventing 模式，升级为 MV3 安全方案：
- 使用 `CustomEvent` 替代已弃用的 `MutationEvent`
- 通信密钥: `crypto.randomUUID()` 在 `document_start` 通过一次性事件共享给 MAIN world
- 事件名格式: `__luban_to_main_{uuid}` / `__luban_to_content_{uuid}`，不可预测
- 数据对象使用 `Object.create(null)` 防原型污染
- 请求-响应关联: 每条消息携带 `requestId`（时间戳+随机数），支持异步回调匹配

### 3.8 安全扫描器 (`service-worker/safety-scanner.ts`)

AI 返回代码后、用户确认前，对 `code` 做静态黑名单扫描:

| 模式 | 风险 | 动作 |
|------|------|------|
| `eval(` / `new Function(` | 任意代码执行 | 拦截 |
| `document.cookie` 出现在 fetch/XHR 载荷中 | 数据外泄 | 拦截 |
| `localStorage.clear()` / `indexedDB.deleteDatabase` | 数据破坏 | 拦截 |
| `fetch(`/`XMLHttpRequest` 目标非当前域 | 数据外泄 | 警告 |
| `while(true)` / `for(;;)` 无 break | 页面崩溃 | 拦截 |
| `__proto__` / `constructor.prototype` | 原型污染 | 警告 |
| 支付/交易关键词出现在 click handler 中 | 金融风险 | 强警告 |

**gmGrants 校验**: 对照 P0 白名单，超范围 API 打桩为 no-op 并在 warnings 中标注。

### 3.9 Side Panel 状态机 (`sidepanel/state-machine.ts`)

**纯函数 reducer** 实现（可测试、可追溯），对应 PRD §8.3 状态图:

```typescript
type UIState =
  | { type: 'IDLE' }
  | { type: 'PICKING' }
  | { type: 'INTENT_INPUT'; element: TargetElement; error?: string }
  | { type: 'GENERATING'; startTime: number; streamContent: string }
  | { type: 'PREVIEW'; result: GenerationResult }
  | { type: 'RESULT'; outcome: 'success' | 'injection_fail' | 'runtime_error'; detail: any };

function uiReducer(state: UIState, action: UIAction): UIState { ... }
```

**状态持久化**: `GENERATING` 和 `PREVIEW` 状态写入 `chrome.storage.session`，应对 SW 休眠与面板误关。Side Panel 重连后从 session 恢复。

---

## 四、错误处理架构（5 层模型）

每层有独立错误码前缀和处理策略:

```typescript
enum ErrorLayer {
  CAPTURE  = 'CAP',   // 采集层
  NETWORK  = 'NET',   // 传输层
  MODEL    = 'MOD',   // 模型层
  INJECT   = 'INJ',   // 注入层
  RUNTIME  = 'RUN',   // 运行层
}
class LubanError extends Error {
  constructor(
    public layer: ErrorLayer,
    public code: string,           // e.g. 'MOD_TIMEOUT'
    public userMessage: string,    // 中文用户可读提示
    public actions: ErrorAction[], // 可执行的恢复动作
    public cause?: Error,
  ) { super(userMessage); }
}
type ErrorAction =
  | { type: 'RETRY' }
  | { type: 'EDIT_INTENT' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'REGENERATE'; withError: string }
  | { type: 'DISMISS' };
```

**原则**: 每个错误必须至少携带一个 `ErrorAction`，UI 根据 actions 渲染按钮，确保「任何错误不静默失败」。

| 错误场景 | 策略 |
|---------|------|
| AI 超时 (60s) | 指数退避重试 1 次 (wait 2s) → 用户手动重试 |
| 401/403 | 不重试，区分「Key 无效/过期/权限不足」，一键跳设置页 |
| 429 限流 | 等 `Retry-After` 或默认 30s，显示倒计时，重试 2 次 |
| SSE 流中断 | 已收 <50% → 全量重试；≥50% → 提示基于已有内容处理 |
| CSP 注入失败 | 按降级链逐级尝试，最多 3 种路径，记录站点，不无谓重试 |
| 脚本运行时错误 | 捕获+格式化堆栈 → 提供「错误反馈 AI 重生成」 |
| SW 休眠恢复 | session 恢复状态机 → 流式请求全量重试 |
| 网络断开 | `navigator.onLine` 监听 → 禁用 AI 入口 → 恢复后自动解除 |
| JSON 解析失败 | 容错链(直接→剥围栏→正则→强化重试) → 切模型 |

---

## 五、存储策略

| 数据 | 存储位置 | Key 格式 | 访问模式 |
|------|---------|---------|---------|
| 脚本列表索引 | `chrome.storage.local` | `luban:scripts_index` | 写少读多（仅 id/name/updatedAt，轻量） |
| 脚本完整数据 | `chrome.storage.local` | `luban:script:{id}` | 按需单条读取（避免全量加载） |
| API Key (混淆) | `chrome.storage.local` | `luban:apiKey` | **不进 sync**，base64 混淆 |
| 全局设置(非敏感) | `chrome.storage.sync` | `luban:settings` | 跨设备同步 |
| UI 临时状态 | `chrome.storage.session` | `luban:uiState` | SW 休眠恢复，关浏览器清除 |
| GM_* 脚本数据 | `chrome.storage.local` | `luban:gm:{scriptId}` | 每脚本隔离命名空间 |
| 站点兼容性缓存 | `chrome.storage.local` | `luban:site:{domain}` | 注入方法追踪 |
| AI Provider 配置 | `chrome.storage.local` (带内存缓存 TTL=30s) | — | 每次请求前读取 |

**批量操作**: `StorageManager` 封装 `chrome.storage.local.get/set` 的批量接口（单次 IPC），带内存缓存避免高频重复读取。

---

## 六、完整数据流（含性能标注）

```
用户点击扩展图标
  │
  ├─[<1ms] chrome.sidePanel.open() → Side Panel 首屏
  │
  ├─[~20ms] chrome.scripting.executeScript() 按需注入 Content Script
  │
  └─ Side Panel「开始选择」→ SW → Content Script
       │
       ├─ 元素选择器激活: mouseover → CSS outline 高亮 (纯CSS零JS)
       │
       └─ click → captureContext(targetEl)
            ├─[~3ms] Phase 1: 目标元素信息
            ├─[~60ms] Phase 2: TreeWalker DOM 摘要 (限流遍历)
            ├─[~10ms] Phase 3: 脱敏
            ├─[~5ms] 选择器生成 + 唯一性验证
            │   总计: ~80ms (P50) ← 目标 <100ms ✓
            │
            └─[<1ms] → SW → Side Panel: 进入意图输入态
                │
                ├─ 用户输入意图/选 chips → 点击「生成」
                │
                └─ SW 处理:
                     ├─[~20ms] PromptBuilder.build() (token 估算+裁剪)
                     ├─[~200ms] fetch 建立 SSE 连接
                     ├─[4-12s] 流式接收 (P50 ~6s, P95 ~12s)
                     │   └─ 每 chunk: SSEParser → Port.postMessage → Side Panel
                     │                 RAF 批量渲染 ← 避免每 token 重绘
                     ├─[~10ms] JSON 解析 (容错链)
                     ├─[~5ms] 安全黑名单扫描 + gmGrants 校验
                     │
                     └─ → Side Panel: 预览态 (explanation + code + warnings)
                          │
                          └─ 用户确认「运行」→ SW:
                               ├─[~15ms] chrome.scripting.executeScript MAIN world
                               │   └─ 含 GM_* 运行时 + storage 快照预注入
                               │   └─ try/catch 包裹用户代码执行
                               │
                               └─ 结果 via CustomEvent桥 → Content → SW → Side Panel
                                    └─ 成功: 展示结果 + 保存选项
                                    └─ 失败: 错误摘要 + 「反馈给 AI 重生成」
                     
            E2E 总计: ~8s (P50), ~15s (P95) ← 目标 ≤15s P95 ✓
```

---

## 七、Service Worker 生命周期管理

**事件驱动架构**（非 alarm keepalive）:
- 顶层同步注册所有事件监听器（MV3 强制要求）
- 冷启动目标: SW 激活到可处理消息 < 50ms

**按需保活**: 仅在 SSE 流式请求期间，Side Panel 维持 `chrome.runtime.connect()` Port 长连接。流结束后立即断开。Chrome 116+ 有活跃 Port 连接时 SW 不会被回收。

**状态持久化与恢复**:
- 每 5s 将 in-flight 状态写入 `chrome.storage.session`
- SW 唤醒时: 读 session → 若 `generating` 且已超时→标记失败通知 UI；若未超时→流已断，整体重试
- 若 `preview` → 脚本已保存在 session 中，Side Panel 重连后恢复展示

---

## 八、manifest.json 核心结构

```jsonc
{
  "manifest_version": 3,
  "name": "鲁班 Luban",
  "version": "0.1.0",
  "description": "AI 网页自动化——说出意图，工具即成",
  "permissions": ["storage", "activeTab", "scripting", "sidePanel"],
  "host_permissions": [
    "https://api.xiaomimimo.com/*",
    "https://token-plan-cn.xiaomimimo.com/*",
    "https://token-plan-sgp.xiaomimimo.com/*",
    "https://token-plan-ams.xiaomimimo.com/*"
  ],
  "background": { "service_worker": "src/service-worker/index.ts", "type": "module" },
  "side_panel": { "default_path": "src/sidepanel/index.html" },
  "options_page": "src/options/index.html",
  "action": { "default_title": "鲁班 Luban" },
  "icons": { "16": "src/assets/icon16.png", "48": "src/assets/icon48.png", "128": "src/assets/icon128.png" }
}
```

**注意**: 不声明 `content_scripts`，Content Script 通过 `activeTab` + `chrome.scripting.executeScript` 按需注入。

---

## 九、分阶段交付计划

### Phase 0: 注入验证 Spike (2-3 天)
**目标**: 验证 `chrome.scripting.executeScript({world:'MAIN'})` 在 10 个 benchmark 站点的成功率。
- 创建最小 MV3 骨架
- 硬编码 `GM_addStyle` 脚本注入 MAIN world
- 逐站测试 + 记录 CSP 行为 + 测试降级路径
- **退出标准**: ≥ 8/10 站点 Method 1 通过

### Phase 1: 骨架 + 通信链路 (3 天)
**目标**: SW ↔ Content Script ↔ Side Panel 消息路由端到端跑通。
- 搭建 Vite + CRXJS 构建
- 实现 manifest.json + 消息协议类型 + SW 消息路由
- Side Panel 最小页面 + Content Script 加载注册
- **退出标准**: Side Panel 按钮 → SW → Content Script → 页面 console.log

### Phase 2: 元素选择 + 上下文引擎 (4 天)
**目标**: 用户可选中元素，Side Panel 展示结构化上下文。
- 元素选择器（悬停高亮+点击捕获+Esc 取消）
- TreeWalker DOM 摘要 + 脱敏 + 选择器生成
- 串联到 Side Panel 展示
- **退出标准**: 任意页面选元素 → Side Panel 显示结构化 JSON

### Phase 3: AI Client + Prompt 引擎 (3 天)
**目标**: 发送上下文+意图到 MiMo，取回可解析脚本。
- AI Client (fetch + SSE + AbortController + Port 保活)
- Prompt 拼装 (System Prompt + token 预算 + 容错解析链)
- Settings 页: API Key 输入 + 前缀校验 + 连通性测试
- **退出标准**: 手动上下文+意图 → AI 返回合法 JSON

### Phase 4: 安全扫描 + 预览 (2 天)
**目标**: 生成代码经扫描后展示给用户确认。
- 安全扫描器黑名单 + gmGrants 白名单校验
- Side Panel 预览视图 (explanation + code（microlighter 高亮）+ warnings + confidence)
- 确认/拒绝/重生成流程
- **退出标准**: 展示 AI 代码+解释；黑名单能拦截 `eval()`

### Phase 5: 注入引擎 + GM_* 运行时 (4 天)
**目标**: 确认的脚本在 MAIN world 执行，GM_* 可用。
- 注入调度器 + 降级链 (基于 Phase 0 结果)
- CustomEvent 桥 (UUID 密钥)
- GM_* P0 运行时 (addStyle/setValue/getValue/deleteValue/info/unsafeWindow)
- 脚本执行器 (try/catch + 错误回报)
- **退出标准**: 淘宝上「标红价格」脚本通过 GM_addStyle 运行

### Phase 6: 脚本管理 + 状态恢复 (3 天)
**目标**: 脚本可持久保存，SW 休眠可恢复。
- 脚本 CRUD + Options 页脚本列表
- 「在当前页再次运行」
- SW 状态持久化/恢复 + Side Panel 重连
- **退出标准**: 保存脚本 → 关面板 → 重开 → 脚本在列表 → 再次运行成功

### Phase 7: 打磨 + Benchmark 验收 (3 天)
**目标**: 通过 PRD §10.3 质量验收标准。
- 10 个 benchmark 场景全跑
- 10 个站点注入验证
- §4.1 全部错误场景覆盖 + Toast 通知
- 网络离线检测 + UI 禁用
- 性能 profiling (上下文 <100ms)
- **退出标准**: PRD 10.3 五项验收全通过

**总估时**: ~22-25 天（1 人）

---

## 十、依赖关系

```
Phase 0 (Spike) ─────────────────────────────┐
                                              │ (结果指导 Phase 5 设计)
Phase 1 (骨架+通信) ──────────────────┐      │
         │                            │      │
         ▼                            │      │
Phase 2 (选择器+上下文) ──────┐       │      │
         │                    ▼       ▼      ▼
         ▼              Phase 3 (AI) → Phase 4 (安全+预览)
                                         │
                                         ▼
                                  Phase 5 (注入+GM_*)
                                         │
                                         ▼
                                  Phase 6 (管理+恢复)
                                         │
                                         ▼
                                  Phase 7 (打磨+验收)
```

- Phase 0 独立优先启动
- Phase 1-3 可部分并行
- Phase 5 依赖 Phase 0 结果 + Phase 4
- Phase 7 依赖所有前置

---

## 十一、风险登记簿

| # | 风险 | 严重度 | 概率 | 缓解措施 |
|---|------|-------|------|---------|
| 1 | **CSP 严格站点注入失败** | 极高 | 低（chrome.scripting 绕过 CSP） | Phase 0 验证；三级降级链；站点兼容追踪；优雅「暂不支持」提示 |
| 2 | **SW 休眠中断 AI 流式请求** | 高 | 中 | Port 长连接保活；session 状态持久化(每5s)；中断后整体重试 |
| 3 | **AI 返回 JSON 不规范** | 中 | 中 | `response_format: json_object`；三层容错解析；强化重试；模型升级 |
| 4 | **AI 生成不安全代码** | 高 | 中 | 静态黑名单拦截；用户确认门槛；MAIN world 无扩展 API 访问 |
| 5 | **Token Plan 合规风险** | 高 | 高(发布期) | 默认引导 `sk-` 按量付费 Key；Token Plan 附风险提示；billing 可一键切换 |
| 6 | **选择器脆弱性** | 中 | 高 | 多候选回退链；AI 指令要求稳健选择器；`querySelector` 判空+等待重试 |
| 7 | **Side Panel 中途关闭/用户跳转** | 中 | 中 | 状态持久化到 session；SW 后台继续生成；Side Panel 重连恢复 |
| 8 | **CustomEvent 桥被页面脚本截获** | 中 | 低 | UUID 密钥 `document_start` 共享；不可预测事件名；`Object.create(null)` 防污染 |
| 9 | **chrome.scripting 注入时序竞态** | 低 | 低 | 等待 `webNavigation.onCommitted`；「tab was closed」错误 100ms 重试 |
| 10 | **GM_getValue 同步语义 vs 异步存储** | 低 | 低 | 注入前预加载快照；写入异步回写；MVP 可接受短暂不一致 |
| 11 | **复杂页面上下文采集超 100ms** | 中 | 中 | TreeWalker depth limit + 元素上限 + 200ms 强制截断返回已采集部分 |

---

## 十二、被否决的替代方案

| 替代方案 | 否决原因 |
|---------|---------|
| **manifest 声明式 `"world":"MAIN"` content script 作为 MVP 主注入** | 声明式脚本是静态的，无法注入动态生成的用户脚本代码；仅适合 P1 持久注入场景 |
| **`window.postMessage` 作为跨世界通信桥** | 页面任意脚本可监听和伪造 postMessage，安全性不足；CustomEvent + UUID 密钥更安全 |
| **React 作为 Side Panel UI 框架** | 40KB+ gzip 体积对 Side Panel 首屏不友好；Preact 3KB 功能等价，`preact/compat` 提供迁移路径 |
| **Content Script 声明式全站自动注入** | 每个页面都加载 ~50KB 脚本，绝大多数页面不会使用扩展；按需注入按 `activeTab` 零额外开销 |
| **alarm keepalive 保持 SW 常驻** | 浪费系统资源；Port 长连接仅在流式请求期间保活，更精确 |
| **IndexedDB 替代 chrome.storage.local** | MVP 数据量小（<100 脚本），chrome.storage 原生异步 API 足够且更简单；IndexedDB 过度设计 |
| **无构建纯 JS 开发** | 多入口（SW/Content/SidePanel/Options）+ TypeScript 类型安全是模块化基础，Vite 构建开销极低 |
| **CodeMirror 作为 MVP 代码高亮方案** | 体积过大（~140KB），MVP 仅需代码展示而非编辑；microlighter (~2KB) 满足高亮需求。如 P1 需要完整代码编辑能力，再评估 CodeMirror 6 或 Monaco 按需引入 |
| **自研正则语法高亮** | 维护成本高、语言覆盖不足；microlighter 基于 TextMate 语法、支持 37 种语言且体积仅 ~2KB |
