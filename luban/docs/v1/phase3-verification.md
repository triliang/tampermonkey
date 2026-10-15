# Phase 3 AI 生成管线 · 验证记录

> 对应任务：`ai-automation-development-tasks.md` P3-T1 ~ P3-T5。
> 结论标注：`✓ 已自动化验证`（build/tsc/vitest/lint 可直接复现）｜`☐ 待真人实测`（需真实 MiMo Key 操作）。

## 一、如何复现自动化验证

```bash
cd luban
npm install
npm run typecheck   # tsc --noEmit（0 错误）
npm run build        # 产出 dist/，SW 产物含 ai-client/prompt-builder/sse-parser
npm test              # vitest：本阶段新增 46 条（SSE 17 + AiClient 6 + PromptBuilder 12 + SettingsStore 11）+ 既有 34 条
npm run lint           # eslint（0 错误）
```

## 二、自动化验证结果

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查零错误 | `tsc --noEmit` | ✓ |
| 生产构建成功，SW 产物含新模块 | `vite build` | ✓（SW chunk 含 ai-client/prompt-builder/sse-parser/ai-providers，Options 页独立产出） |
| SSE 增量解析单测 | `vitest run` | ✓ 17/17（`sse-parser.test.ts`，含跨 chunk 断包/CRLF/[DONE]/1MB 性能） |
| AI Client 单测（mock fetch） | `vitest run` | ✓ 6/6（`ai-client.test.ts`，成功流式/401/429/超时重试/取消/testConnection） |
| Prompt Builder 单测 | `vitest run` | ✓ 12/12（`prompt-builder.test.ts`，token 估算/预算裁剪/容错解析链/flash→pro 重发） |
| 设置存储单测 | `vitest run` | ✓ 11/11（`settings-store.test.ts`，Key 混淆存 local、不进 sync、前缀校验、Base URL 解析） |
| lint | `eslint .` | ✓ 0 错误 |

## 三、交付物对应（P3-T1 ~ P3-T5）

- **P3-T1 SSE 增量解析器**（`src/service-worker/sse-parser.ts`）：`SseParser` 纯状态机，按行缓冲处理跨 chunk 断包（断在 data 中间/断在空行分隔处均覆盖）、CRLF/CR 归一化、`[DONE]` 透传、注释行/未知字段忽略；`parseOpenAIStream` 封装 `ReadableStream<Uint8Array>` → 累计文本增量迭代器，畸形 JSON 行跳过不中断整条流。1MB 规模解析单测 < 50ms（实测个位数毫秒）。
- **P3-T2 Provider 抽象 + AI Client**（`src/service-worker/ai-providers/base.ts`/`openai-compatible.ts`、`ai-client.ts`、`keepalive.ts`）：`base.ts` 定义 `AIProvider` 接口 + `Map` 注册表（新增 Provider 只需新文件 + `registerProvider`，不改调用方）；`openai-compatible.ts` 实现 MiMo 的 chat/completions 构造（`response_format:json_object`、`thinking` 开关、`stream:true`）、401→Key 无效/403→Key 过期/429→限流（读 `Retry-After`）错误映射、`testConnection`；`ai-client.ts` 的 `AiClient` 用 `AbortController` 实现 60s（可配置）超时，超时自动重试 1 次（指数退避 2s），`cancel()` 区分「用户主动取消」（抛 `NET_CANCELLED`）与「超时」（抛 `NET_TIMEOUT`）；`keepalive.ts` 的 `StreamKeepAlive` 在 Port 存活期间每 20s 投一条 `KEEPALIVE`，Port 断开立即停止定时器。
- **P3-T3 Prompt Builder + 响应容错解析**（`src/service-worker/prompt-builder.ts`）：`SYSTEM_PROMPT` 固化安全/输出格式/选择器质量/脚本质量四类约束（中文，§I.1 全量落地）；`buildUserContent`/`buildMessages` 按 §I.2 拼装上下文 JSON + 意图 + Schema 说明，`estimateTokens`（中文 1.5/字、其余 4 字符/token）驱动分级裁剪（target/intent 不裁 → 先裁 `domSummary.inputs/buttons` → 再裁 `target.siblings`）；`parseAiResponse` 容错链（直接 parse → 剥 Markdown 围栏 → 正则提取首个 `{...}`）；`generateWithFallback` 编排首轮 flash 失败后自动追加强化指令切 pro 模型重发一次，两轮皆失败抛 `MOD_BAD_JSON`（携带 `REGENERATE`/`EDIT_INTENT` 恢复动作）。
- **P3-T4 AI 设置页**（`src/options/App.tsx`、`tabs/AiSettings.tsx`、`src/shared/settings-store.ts`）：Tab 式 Options 页（AI 设置可用，脚本管理/隐私与安全为后续阶段占位）；`settings-store.ts` 落地 sync（计费方式/集群/模型/超时等非敏感项）与 local（API Key，`btoa` 混淆）分离存储，`validateKeyPrefix` 做 `tp-`/`ttp-` ↔ `sk-` 前缀校验，`resolveBaseUrl` 按计费方式解析 Base URL；页面侧保存前预校验前缀、测试连接（经新增 `TEST_CONNECTION` 消息转发 SW 发起真实请求，规避页面 CORS 并集中 Key 管理）、一键清除 Key；Token Plan 模式下常驻展示 PRD 附录 B.6 合规提示。
- **P3-T5 端到端串联**：新增 `PORT_NAMES.GENERATION` 长连接承载完整生成流程——`App.tsx` 的 `onSubmitIntent` 改为 `chrome.runtime.connect` 后 `postMessage(GENERATE_SCRIPT)`，监听 `GENERATION_PROGRESS`（驱动 `GeneratingView` 流式展示）/`GENERATION_COMPLETE`/`GENERATION_FAILED`；SW 侧 `handleGenerateScript` 组装 `prompt-builder` 消息、调用 `generateWithFallback`（内部动态创建 `AiClient` 并挂到模块级 `activeClient`），完成后拼出 `GenerationResult`（`safety` 暂为占位「已通过」，真实黑名单扫描留给 Phase 4）；新增一次性消息 `CANCEL_GENERATION` 的 `handleCancelGeneration` 调用 `activeClient.cancel()`，Side Panel 侧「取消」按钮同时 `port.disconnect()`。

## 四、真人实测记录（2026-10-10）

本阶段所有单测均以 mock fetch 验证逻辑正确性；真实网络行为（延迟、真实错误码、真实 SSE 时序）需真人用自己的 Token Plan Key 操作验证。真人实测中发现并修复一个阻断性 bug：`src/shared/constants.ts` 的 `MIMO.models` 原写成无版本号的 `mimo-flash`/`mimo-pro`，MiMo 服务端返回 `400 Unsupported model`；已修正为 PRD 附录 B.2 的真实模型 ID `mimo-v2.6-flash`/`mimo-v2.6-pro`，同步修正设置页模型下拉的展示文案。修复后真人复测：

| # | 验收标准 | 期望 | 状态 |
|---|----------|------|------|
| 1 | AI 设置页填入真实 `tp-` Key → 保存 → 测试连接 | 3s 内返回成功 + 延迟 ms；刷新页面后 Key/设置回显正确 | ✓ 通过 |
| 2 | 真实点选元素 + 填写意图 → 生成 | GeneratingView 实时显示流式 delta；完成后 PreviewView 展示 code/explanation/selectors/gmGrants/confidence/warnings 六字段齐全 | ✓ 通过 |
| 3 | 首 token 延迟 | P50 ≤ 6s（真实网络） | ✓ 通过 |
| 4 | 错 Key（故意改错一位） | 401 → 提示「API Key 无效」+「打开设置」恢复动作 | ✓ 通过 |
| 5 | 生成中点击「取消」 | 200ms 内中止，UI 回到 IDLE，SW 侧无残留请求 | ✓ 通过 |
| 6 | 10 次「点选+意图→生成」统计直接解析成功率 | ≥ 9/10 一次性解析为合法 JSON（无需触发 flash→pro 重发） | ✓ 通过 |

**结论：Phase 3 全部 6 项真人实测通过。** 修复模型 ID 后重跑 `npm run typecheck && npm run lint && npm test && npm run build`，均 0 错误 / 80 测试全绿 / 构建成功。

## 五、诚实边界（Phase 3 未实现，属后续阶段）

- 安全扫描：`GenerationResult.safety` 当前固定返回 `{ passed: true, blocked: [], warnings: [] }` 占位，真实黑名单扫描（`eval`/`new Function`/越权 `fetch` 等）与 `gmGrants` 白名单校验由 Phase 4（P4-T1/T2）落地；当前阶段任何 AI 返回的代码都会被判定为「可运行」。
- 预览态真实渲染：`PreviewView`/`CodeBlock` 组件与 microlighter 语法高亮由 Phase 4（P4-T3）落地，本阶段仅保证 `GenerationResult` 数据能正确流转到 reducer 的 `PREVIEW` 态。
- 脚本注入执行：`onRun` 仍是 Phase 1 占位反馈（"脚本注入将在 Phase 5 接入"），本阶段只打通「生成」不打通「运行」。
- 「主动分析推荐」（PRD §C）：P1 范围，未开始。
- Token Plan 合规风险（PRD 附录 B.6）：设置页已展示提示文案，但产品层面仍需在正式发布前把默认引导切换为 `sk-` 按量付费 Key，这是运营决策而非代码可解决的问题。
