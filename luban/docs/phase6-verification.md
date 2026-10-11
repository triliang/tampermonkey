# Phase 6 脚本管理 + 状态恢复 · 验证记录

> 对应任务：`ai-automation-development-tasks.md` P6-T1 ~ P6-T6。
> 结论标注：`✓ 已自动化验证`（build/tsc/vitest/lint 可直接复现）｜`✓ 通过`（真人实测）｜`☐ 未测`。

## 一、如何复现自动化验证

```bash
cd luban
npm install
npm run typecheck   # tsc --noEmit（0 错误）
npm run build        # 产出 dist/，SW 含 script-store / storage-manager / state-recovery；Options 含脚本管理页
npm test              # vitest：本阶段新增 3 条（script-store.test.ts）+ 既有 126 条
npm run lint           # eslint（0 错误）
```

加载扩展：`chrome://extensions` → 开发者模式 → 加载已解压 → 选 `luban/dist`。每一项操作前先点一次工具栏里的鲁班图标，否则当前页没有授权。

## 二、自动化验证结果

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查零错误 | `tsc --noEmit` | ✓ |
| 生产构建成功 | `vite build` | ✓（SW 产物含 script-store / state-recovery；Options 与 Side Panel 独立产出） |
| 脚本库 + 存储单测 | `vitest run` | ✓ 3/3（`script-store.test.ts`：CRUD 后索引与单条一致且删除同步清 `luban:gm:{id}`；100 个 key 一次 `set`；缓存命中后第二次 `get` 不再打 storage） |
| 全量回归 | `vitest run` | ✓ 129/129（11 个测试文件） |
| lint | `eslint .` | ✓ 0 错误 |

## 三、交付物对应（P6-T1 ~ P6-T6）

- **P6-T1 StorageManager + ScriptStore**（`src/service-worker/storage-manager.ts`、`script-store.ts`）：`StorageManager.set` 一次写入任意多个 key，只调用一次 `chrome.storage.local.set`，并写入内存缓存；同一 key 第二次 `get` 不再打 storage。`ScriptStore` 用 `luban:scripts_index` 存轻量索引（`id` / `name` / `updatedAt` / `source`），用 `luban:script:{id}` 存完整脚本。`UserScript` 对齐 PRD §7：`description`、`matches`、`enabled`、`runAt`、`source`、`gmGrants`、`aiMeta`（`intent` / `provider` / `model` / `pageContextSnapshot` / `createdAt`）。`delete` 同时删单条记录、索引项和 `luban:gm:{id}`。GM 读写走 `readGm` / `writeGm`（`deleteValue` 的 `dirty` 值为 `null` 时删键）。
- **P6-T2 SAVE_SCRIPT / RUN_SAVED_SCRIPT**（`src/service-worker/index.ts`）：`SAVE_SCRIPT` 落库并返回 `id`，随后向当前页发 Toast。`RUN_SAVED_SCRIPT` 读出脚本，用保存时的 `matches`（`*://{hostname}/*`，hostname 来自采集到的页面 URL）对比当前标签；不匹配则返回「请先打开目标页面」。匹配则走 Phase 5 注入链，注入前读 `luban:gm:{id}`，返回的 `dirty` 再写回。未保存的预览态运行仍传空快照，不落 GM 存储。
- **P6-T3 Options 脚本管理 + 最近脚本**（`src/options/tabs/ScriptManager.tsx`、`src/sidepanel/views/IdleView.tsx`）：设置页「脚本管理」列出名称、来源徽标（AI / 手动）、更新时间，可「在当前页运行」或删除（`confirm` 二次确认）。空列表显示引导文案。侧栏空闲页「最近脚本」取 `updatedAt` 降序的前 3 条，点击即 `RUN_SAVED_SCRIPT`。
- **P6-T4 结果页 + Toast**（`src/sidepanel/views/ResultView.tsx`、`src/content/toast.ts`）：成功态展示效果说明，以及「再次运行」「保存到列表」「仅本次运行」。失败态展示错误摘要，主按钮为「反馈 AI 重生成」，回到意图页并把错误文本写入输入框。保存成功后页面右下角 Toast 文案为「脚本已保存」，5 秒后消失；点击 Toast 发 `FOCUS_PANEL`，SW 调用 `chrome.sidePanel.open`。「仅本次运行」只回空闲页，不写存储。
- **P6-T5 状态快照**（`src/service-worker/state-recovery.ts`）：侧栏在 `GENERATING` 时立刻写一次 `chrome.storage.session` 的 `luban:uiState`，之后每 5 秒写一次；进入 `PREVIEW` 时写入含 `result`（code / explanation / warnings 等）的快照。`GET_STATE` 读出快照：生成已超过 60 秒则 `expired: true` 并删掉 session 键，侧栏回到意图页并提示「生成已超时，请重试」；未超时则恢复「生成中」并整段重试。`StreamKeepAlive` 仍在 `keepalive.ts`，本阶段未再搬动。
- **P6-T6 重连恢复**：侧栏启动先 `GET_STATE`，在快照返回前只渲染顶栏、不渲染空闲页，避免闪一下别的视图。无快照时进入空闲页。退出链是：保存 → 关侧栏 → 再打开 → 最近脚本或设置页列表里能看到 → 再次运行成功。

## 四、真人实测记录（2026-10-10）

操作顺序与下表编号不同：实测按「1 保存重开 → 2 存两条再删 → 3 换站 → 4 仅本次 → 5 出错重生成 → 6 生成中停 SW（含 5 秒写入）→ 7 预览中停 SW → 8 断网再运行 → 9 退出 Chrome」执行，用户逐项确认通过。当前 Chrome 的 `chrome://inspect/#service-workers` 没有 Stop，对应按钮是 **terminate**；鲁班那一行的脚本名是 `service-worker-loader.js`。

| # | 验收标准 | 期望 | 状态 |
|---|----------|------|------|
| 1 | 保存 → 关侧栏 → 重开 → 列表里有 → 再次运行 | 结果页点「保存到列表」后，页面右下角出现「脚本已保存」，约 5 秒消失。关掉侧栏再打开，空闲页「最近脚本」能看到该条；再点它，2 秒内回到「脚本运行成功」。设置页「脚本管理」里同一条也在 | ✓ 通过（存储里 `aiMeta.model` / `pageContextSnapshot` 的控制台展开未单独复核） |
| 2 | 保存两次是两条记录 | 预览页的「保存」每点一次新建一条。设置页出现两条；删一条时取消仍在，确认后少一条 | ✓ 通过 |
| 3 | 域名不匹配 | 在站点 A 保存后，到站点 B 再运行 | 出现「请先打开目标页面」，不白屏 | ✓ 通过 |
| 4 | 仅本次运行不进列表 | 只点「仅本次运行」。最近脚本和设置页都没有这条 | ✓ 通过 |
| 5 | 运行失败可带回重生成 | 结果页标题为「脚本运行出错」时，点「反馈 AI 重生成」，意图框带上错误文本 | ✓ 通过 |
| 6 | Toast 点击回到侧栏 | 保存后立刻点「脚本已保存」 | 侧栏被打开 | ✓ 通过（含在第 1 项里） |
| 7 | 生成中关掉 SW 再开侧栏 | 生成过程中对鲁班点 terminate，关侧栏再打开 | 60 秒内回到「正在生成脚本…」并重新生成；超过 60 秒回到意图页并提示「生成已超时，请重试」，不是白屏 | ✓ 通过（含超时分支） |
| 8 | 预览中关掉 SW 再开侧栏 | 停在预览页时 terminate，关侧栏再开 | 说明和代码还在 | ✓ 通过 |
| 9 | session 大约每 5 秒写一次 | 生成过程中 `chrome.storage.session.onChanged` 打印 `luban:uiState` | 进入生成后马上有一次，之后大约每 5 秒一次 | ✓ 通过（含在第 7 项的同一次操作里） |
| 10 | 浏览器重启无脏状态 | 停在生成或预览时彻底退出 Chrome，再打开点图标 | 直接是空闲页；已保存脚本仍在 | ✓ 通过 |
| 11 | 断网仍可再次运行 | 断开网络后在原页面点已保存脚本 | 不进入「正在生成脚本…」，直接回到运行结果 | ✓ 通过 |
| 12 | 空列表 | 删光脚本后看设置页和侧栏最近脚本 | 有引导文案，布局不破 | ✓ 通过 |
| 13 | 退出标准全链 | 第 1 项留一屏录屏或截图 | 与第 1 项同一结果 | ✓ 通过（2026-10-11 确认已留档） |

第 7 项第一次操作时，粘上 `onChanged` 监听后去选元素，选择层没有出现，页面直接跳转。根因有两处：生成结束时的清空和还在路上的快照写入撞在一起，旧预览被写回 `luban:uiState`，侧栏重开就恢复到预览；在 `chrome://extensions` 上点图标会把 `luban:activeTabId` 记成扩展管理页，选择指令打不到目标网页。已修：快照写入带单调 `updatedAt`，更旧的写入丢弃；非 `http`/`https`/`file` 页面上的图标点击不再覆盖活动标签；`START_PICKER` 失败时侧栏展示错误并退出选择。重新加载 `luban/dist` 后再测，第 7、9 项通过。

GM 持久化未单独复核：保存后的脚本若调用了 `GM_setValue`，控制台应能看到 `luban:gm:{id}`。本次验收没有用带 `GM_setValue` 的脚本去对这一项。

**结论：第 1–13 项全部通过。** 第 12、13 项于 2026-10-11 确认。第 1 项的 `aiMeta` 控制台展开、GM 持久化均未单独复核，不影响本阶段退出。

## 五、诚实边界

- **50 条列表 < 200ms** 没有自动化夹具，也没有「批量造数」按钮。日常列表远小于 50 条；若要卡这一个数字，需在控制台自行写入 50 条 `luban:script:*` 与索引后再打开设置页，本阶段未做该夹具。
- **结果页「保存到列表」只保存一次**。任务里的「保存两次得到两条记录」要用预览页的「保存」连点两次，或做两次独立生成。
- **运行失败的行号**：错误摘要来自 `Error.message`。Chrome 的 `Error` 通常没有 `lineNumber`，所以界面上多半只有消息、没有行号；引擎若提供 `lineNumber` 会追加「(行 N)」。
- **Toast 只在保存成功时出现**，文案固定为「脚本已保存」。运行失败不弹 Toast，错误留在结果页。
- **断网监听未做**。`navigator.onLine` 横幅是 Phase 7（P7-T4）。本阶段只保证「再次运行」不依赖 AI 请求，断网时注入本身仍可用。
- **生成中的「未超时则整段重试」** 会再发一次生成请求，不恢复已经流到一半的文本。原请求若因 SW 被 Stop 而中断，重开侧栏等于重新生成。
- **匹配规则只比较 hostname**，形如 `*://item.taobao.com/*`。同一站点换子域（`www` 与裸域）会判为不匹配并提示「请先打开目标页面」。
