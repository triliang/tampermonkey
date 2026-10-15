# Phase 1 骨架与通信 · 验证记录

> 对应任务：`ai-automation-development-tasks.md` P1-T1 ~ P1-T6。
> 结论标注：`✓ 已自动化验证`（build/tsc/vitest 可直接复现）｜`☐ 待浏览器实测`（需真人加载扩展点击）。

## 一、如何复现自动化验证

```bash
cd luban
npm install
npm run build     # tsc --noEmit（0 错误）+ vite build（产出可加载 dist/）
npm run dev       # Vite + CRXJS dev server（ready，HMR/自动重载）
npm test          # vitest：状态机单测
npm run lint      # eslint（0 错误）
```

加载扩展：`chrome://extensions` → 开发者模式 → 加载已解压 → 选 `luban/dist`。

## 二、自动化验证结果

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查零错误 | `tsc --noEmit` | ✓ |
| 生产构建产出 3 入口 + content IIFE | `vite build` | ✓（SW loader / sidepanel.html / options.html / src/content/index.js） |
| manifest 路径重写正确 | 检查 `dist/manifest.json` | ✓（service_worker→loader、side_panel、options_page、icons） |
| 状态机全迁移（含 5 视图可达 + 非法幂等） | `vitest run` | ✓ 9/9 |
| lint | `eslint .` | ✓ 0 错误 |
| dev server 启动 | `vite` | ✓ ready 无报错 |

## 三、交付物对应（P1-T1 ~ P1-T6）

- **P1-T1 脚手架**：`package.json` `vite.config.ts` `tsconfig.json` `eslint.config.js` `.gitignore` `vitest.config.ts`；技术栈 Vite@8 + `@crxjs/vite-plugin@3` + TypeScript@5.9(strict) + Preact@11。
- **P1-T2 shared**：`src/shared/{types,messages,constants,errors,i18n-strings}.ts`。
- **P1-T3 manifest + SW 路由**：`manifest.json`（§八逐条一致，无 `content_scripts`）；`src/service-worker/index.ts`（顶层同步注册；按 `type` 路由；未知类型返回错误响应不抛异常；`activeTab` 记住点击标签页存 session）。
- **P1-T4 Content 按需注入**：`src/content/index.ts`（`globalThis.__luban_content_loaded` 幂等守卫；PING→PONG、START_PICKER→ack）；SW `ensureContentInjected` 经 `chrome.scripting.executeScript({files:[contentScriptPath]})` 注入 CRXJS 产出的自包含 IIFE。
- **P1-T5 Side Panel**：`src/sidepanel/`（`App.tsx` + `state-machine.ts` 纯 reducer + `views/`5 视图 + `components/Button.tsx` + `comms.ts` + `styles/panel.css`）。
- **P1-T6 E2E**：`App.tsx` 空闲视图「通信链路自检」按钮 → `selfTest()` 并发 `PING{to:content}` 与 `PING{to:main}`；SW content 腿走 `tabs.sendMessage`、main 腿走 `executeScript world:MAIN`（绕 CSP）。

## 四、待浏览器实测（阶段退出门）

在 `dist` 加载扩展后，于任一 http(s) 页面执行：

| # | 验收标准 | 期望 | 状态 |
|---|----------|------|------|
| 1 | SP→SW→CS 通 | 点图标开面板→空闲视图点自检→`Content (ISOLATED)` 显示 `✓ content` | ✓ 实测通过（见下方真人验证记录） |
| 2 | SP→SW→MAIN 通 | 同上 `Main (页面上下文)` 显示 `✓ main`（严格 CSP 站也应成功） | ✓ 实测通过（见下方真人验证记录） |
| 3 | 按需注入幂等 | 同页多次自检，console 仅一条 `luban content ready`（守卫生效） | ✓ 实测通过 |
| 4 | 无 activeTab 反馈 | 未点图标直接自检 → 错误提示「请先点击扩展图标」，SW 不崩 | ✓ 实测通过（见下方记录） |
| 5 | 未知消息不抛 | SW console 无未捕获异常；路由对未接入类型回错误响应 | ✓ 实测通过（见下方记录） |
| 6 | 状态机驱动 5 视图 | 点「开始选择」→PICKING；提交意图→GENERATING→（Phase 3 未接入）回退显示原因 | ✓ 实测通过（范围见下方记录） |

> content/main 两条腿分别对应 Phase 0 已证实的两条注入路径；严格 CSP 站点（如 GitHub）应 `✓ main` 成功——这正是 MAIN world 绕 CSP 主路径的再次印证。

### 真人验证记录（2026-10-10）

- **首次测试**：未直接点击扩展图标打开侧栏（经 Chrome 侧边栏切换器打开），且期间刷新/跳转过标签页，`activeTab` 授权未生效/已失效，Content、Main 两腿均报 `Cannot access contents of the page. Extension manifest must request permission to access the respective host.`。
- **根因**：`resolveActiveTabId()` 原有 `chrome.tabs.query({active:true, lastFocusedWindow:true})` 兜底会返回一个"看起来有效但从未被授权"的 tabId，导致真正执行 `executeScript`/`tabs.sendMessage` 时才暴露 Chrome 原生报错，而不是预期的友好提示。
- **修复**（`src/service-worker/index.ts`）：
  1. 去掉虚假兜底，`resolveActiveTabId()` 无存量 tabId 时直接抛「请先点击扩展图标以授权当前页面」；
  2. 新增 `toActiveTabError()`，统一拦截 `executeScript`/`tabs.sendMessage` 抛出的 Chrome 原生权限错误，转换为「当前页面的授权已失效，请重新点击扩展图标后再试」。
- **复测**：按「点击 Luban 图标打开侧栏 → 不刷新/跳转该页 → 直接点通信链路自检」操作，`Content (ISOLATED)` 与 `Main (页面上下文)` 均显示 `✓`，截图留档。验收项 #1、#2 通过。
- **#3 复测**：同页连续点自检 2~3 次，`[luban content] ready in ...` 仅出现一条，幂等守卫生效。验收项 #3 通过。
- **#4 测试中发现的次生 bug**：在 `chrome://extensions` 页面本身打开侧栏点自检，Content、Main 两腿报 `Cannot access a chrome:// URL`，未被 `toActiveTabError()` 的正则覆盖（原正则只匹配"授权失效"场景，不含"浏览器内置页天然不可注入"场景），直接把 Chrome 原生报错透传给用户。
  - **根因**：`toActiveTabError()` 缺少对 `chrome://`、Chrome 应用商店等受限页面的识别分支；这类页面无论是否点过图标都永久无法注入，必须和"activeTab 授权失效"（可通过重新点图标恢复）区分成不同提示。
  - **修复**：在 `toActiveTabError()` 中新增匹配 `Cannot access a chrome:// URL` 等受限页面报错的分支，复用已有的 `ErrorFactory.captureRestrictedPage()`，返回「当前页面无法采集内容（浏览器限制）」。
- **#4 复测**：确认 session storage 已不含 `luban:activeTabId`（`chrome.storage.session.clear()` 生效）后，在普通网页上不点图标直接点自检，`Content (ISOLATED)` 与 `Main (页面上下文)` 均显示 `✗ 请先点击扩展图标以授权当前页面。`，SW 未崩溃、未透传原生报错。验收项 #4 通过。
- **#5 复测**：改为在 Side Panel 自身的 DevTools 控制台（而非 SW 控制台，避免同上下文自发自收的 Chrome 消息机制已知怪异行为）执行 `chrome.runtime.sendMessage({type:'SAVE_SCRIPT',...})`，返回 `{layer:'NET', code:'NET_UNKNOWN_TYPE', message:'未知消息类型：SAVE_SCRIPT', actions:[{type:'DISMISS'}]}`，无 Uncaught 异常。验收项 #5 通过。
- **#6 复测**：点「开始选择元素」后用 `document.querySelector('.view h2')?.textContent` 探测，标题由「准备好帮你自动化这个页面了」（IDLE）变为「请在页面上点选目标元素…」（PICKING），确认真实切换成功（两视图布局相近，肉眼不易察觉，用 DOM 探测确认）；点「取消选择」应回到 IDLE 标题。`INTENT_INPUT`→`GENERATING`→回退 的后续转换已由 `vitest run`（9/9）在 reducer 层验证；在真实页面上无法进一步触发，因为 `content/index.ts` 的 `START_PICKER` 目前只回执 `{ok:true,started:true}`，并未监听页面点击产出 `ELEMENT_PICKED`——这是明确的 Phase 2 边界（元素选择器真实采集），不是 Phase 1 缺陷。验收项 #6 在 Phase 1 范围内通过。

## 五、诚实边界（Phase 1 未实现，属后续阶段）

- `GENERATE_SCRIPT` / `INJECT_SCRIPT`(用户脚本) / `SAVE_SCRIPT` / `RUN_SAVED_SCRIPT` / Port 流式：SW 尚无对应 handler，触发会命中「未知消息类型」错误响应（不静默失败）。AI 接入=Phase 3，注入引擎+GM_*=Phase 5，持久化=Phase 6。
- 元素选择器与 PageContext 真实采集=Phase 2（当前 App 用 `stubContext` 占位）。
- 语法高亮（microlighter）用于预览代码=Phase 4。
