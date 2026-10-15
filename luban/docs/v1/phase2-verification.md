# Phase 2 元素选择 + 上下文引擎 · 验证记录

> 对应任务：`ai-automation-development-tasks.md` P2-T1 ~ P2-T5。
> 结论标注：`✓ 已自动化验证`（build/tsc/vitest/lint 可直接复现）｜`☐ 待浏览器实测`（需真人加载扩展操作）。

## 一、如何复现自动化验证

```bash
cd luban
npm install
npm run typecheck   # tsc --noEmit（0 错误）
npm run build        # 产出 dist/，content/index.js 含选择器+上下文引擎
npm test              # vitest：选择器回退链 12 条 + 上下文脱敏/限流 13 条 + 原状态机 9 条
npm run lint           # eslint（0 错误）
```

## 二、自动化验证结果

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查零错误 | `tsc --noEmit` | ✓ |
| 生产构建成功，content 产物含新模块 | `vite build` | ✓（`dist/src/content/index.js` 6.03kB，含 picker/selector-generator/context-engine/toast） |
| 选择器回退链单测 | `vitest run` | ✓ 12/12（`selector-generator.test.ts`） |
| 上下文脱敏 + 限流单测 | `vitest run` | ✓ 13/13（`context-engine.test.ts`，含 8 条脱敏 + 4 条限流 + 1 条目标元素采集） |
| lint | `eslint .` | ✓ 0 错误 |

## 三、交付物对应（P2-T1 ~ P2-T5）

- **P2-T1 ElementPicker**（`src/content/element-picker.ts` + `toast.ts`）：真人实测在 CSDN 等含广告位的站点发现 capture 阶段监听的点击拦截会被页面自身更早注册的监听器抢先（on-demand 注入天然晚于页面脚本，这场"谁先注册谁先执行"的竞速必输），遂重写为「全屏透明最高层 overlay + `elementsFromPoint` 穿透取真实元素」方案：鼠标事件的 hit-test 目标直接是 overlay 本身，页面原生监听器根本收不到事件（非竞速问题，是事件分发阶段就没有它们的份），与 DevTools 审查元素模式同思路；悬停提示浮层显示 `tag#id.class` 摘要。Esc 退出：overlay 上的 `keydown` 监听配合 `overlay.focus()` 仍无法在侧栏持有键盘焦点时生效（Side Panel 与被检查标签页是两个独立的浏览上下文，content script 无法跨上下文抢焦点），最终在 `src/sidepanel/App.tsx` 新增仅在 `state.type === 'PICKING'` 时生效的 `window` 级 `keydown` 监听，直接调用已有的 `onCancelPick()`，从源头解决。
- **P2-T2 SelectorGenerator**（`src/content/selector-generator.ts`）：候选链 `#id → 稳定[data-*] → 稳定.class → tag.class → nth-child 兜底`；每候选经 `querySelectorAll` 验证唯一；动态 class（`css-*`/`jsx-*`/哈希类名）排除；单测 12 条全绿。
- **P2-T3 TreeWalker DOM 摘要 + 脱敏**（`src/content/context-engine.ts`）：`captureTargetElement`（Phase 1 同步）、`summarizeDom`（Phase 2 TreeWalker，`maxInputs/maxButtons/maxDepth` 限流 + 200ms 强制截断）、`sanitizeUrl`（Phase 3 脱敏，剔除 `token/session/auth/key/secret` 参数；本模块不采集任何 input value，password 值天然零采集）。
- **P2-T4 上下文串联 Side Panel 展示**：`content/index.ts` 的 `START_PICKER` 分支启动 `startElementPicker`，拾取后调用 `collectPageContext` 并以 `ELEMENT_PICKED` 广播（content 直接 `chrome.runtime.sendMessage`，SW 侧 `handleElementPicked` 仅确认收到不二次转发，避免重复投递）；`App.tsx` 新增 `chrome.runtime.onMessage` 监听，收到后 `setPageContext` + `dispatch(ELEMENT_PICKED)`；`IntentView.tsx` 新增可展开的「查看完整上下文 JSON」区块，直接渲染结构化 `PageContext`。真人实测中还发现侧栏「取消选择」按钮此前只改本地 UI 状态，从未真正通知 content script 停止 picker（页面高亮/拦截仍在后台运行），遂新增 `CANCEL_PICKER`（SidePanel→SW→Content）/`PICK_CANCELLED`（Content→SidePanel 广播）消息类型，补齐取消链路。
- **P2-T5 单测与性能基线**：`npm test` 全绿（34/34，含本阶段新增 25 条）；`npm run lint` 零错误。真实站点性能基线（P50/P95）与跨域 iframe 行为需真人在浏览器中实测，用户已明确跳过性能基线测试（#5），见下节。

## 四、真人实测记录（2026-10-10）

在 CSDN（`https://www.csdn.net/`）等含广告位的真实站点及常规页面上逐项复测：

| # | 验收标准 | 期望 | 状态 |
|---|----------|------|------|
| 1 | 悬停高亮 | 鼠标悬停任意元素出现蓝色描边高亮，移出即消失；滚动页面时高亮不错位 | ✓ 通过 |
| 2 | 点击拦截原生行为 | 点击链接/按钮不跳转/不提交，而是触发采集并退出选择模式 | ✓ 通过（修复前：CSDN 广告图点击仍会跳转，`document` 原生监听器抢先触发；已通过 overlay + `elementsFromPoint` 方案修复并复测通过） |
| 3 | Esc 退出 | 选择模式中按 Esc 立即退出，连续进出 10 次无遗留监听器 | ✓ 通过（修复前：Esc 完全无效，根因是键盘焦点始终停留在侧栏自身的浏览上下文，content script 无法跨上下文抢焦点；已在 `App.tsx` 新增侧栏侦听 Esc 并调用 `onCancelPick()`，修复后复测通过） |
| 4 | 任意页面选元素 → Side Panel 展示结构化 JSON（Phase 2 退出标准） | 选中元素后 IntentView 显示元素卡片 + 展开后可见完整 `PageContext` JSON | ✓ 通过 |
| 5 | 真实站点性能基线 | P50 < 100ms | ⏭ 用户明确要求跳过，不测 |
| 6 | 含 fixed 顶栏/iframe 页面兼容 | 含 `position:fixed` 顶栏的页面可正常选中主文档元素；iframe 内点击不崩 | ☐ 未单独复测，未发现相关异常报告 |

过程中额外发现并修复一个未在原检查清单中的问题：侧栏「取消选择」按钮此前不会通知 content script 真正停止 picker，已通过新增 `CANCEL_PICKER`/`PICK_CANCELLED` 消息链路修复，真人复测确认「没有问题」。

**结论：Phase 2 核心验收标准（1-4）全部通过，#5 按用户要求跳过，#6 未发现异常但未逐项复测。** 修复全部完成后重跑 `npm run typecheck && npm run lint && npm test && npm run build`，均 0 错误 / 34 测试全绿 / 构建成功。

## 五、诚实边界（Phase 2 未实现，属后续阶段）

- `GENERATE_SCRIPT` 真实调用 AI：Phase 3 接入，当前 `onSubmitIntent` 已改为优先使用真实采集的 `PageContext`，但 SW 仍无 `GENERATE_SCRIPT` handler，会命中「未知消息类型」错误响应（不静默失败）。
- iframe 内部元素选择：本阶段 picker 仅挂载主文档监听器，不支持穿透选中 iframe 内部元素；跨域 iframe 点击落在 iframe 元素本身时按主文档的 iframe 节点处理，这是明确的 MVP 边界。
- 悬停高亮在页面已有 `!important` 样式冲突时的极端兼容性未逐站验证，留给 Phase 7 Benchmark 阶段。
