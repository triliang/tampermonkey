# Phase 5 注入引擎 + GM_* 运行时 · 验证记录

> 对应任务：`ai-automation-development-tasks.md` P5-T1 ~ P5-T5。
> 结论标注：`✓ 已自动化验证`（build/tsc/vitest/lint 可直接复现）｜`☐ 待真人实测`（需真实浏览器 Side Panel + 目标网站操作）。

## 一、如何复现自动化验证

```bash
cd luban
npm install
npm run typecheck   # tsc --noEmit（0 错误）
npm run build        # 产出 dist/，SW 产物含 injection-dispatcher；content 产物含 injected-runner + event-bridge
npm test              # vitest：本阶段新增 20 条（injected-runner 12 + injection-dispatcher 8）+ 既有 106 条
npm run lint           # eslint（0 错误）
```

## 二、自动化验证结果

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查零错误 | `tsc --noEmit` | ✓ |
| 生产构建成功 | `vite build` | ✓（content IIFE 产物含 `GM_getValue/setValue/deleteValue/addStyle/info` 五个字符串，确认 `lubanRunScript` 被正确打包；`dist/assets/grammars/javascript.js` 仍存在，Phase 4 修复未回退） |
| GM_* 运行时单测 | `vitest run` | ✓ 12/12（`injected-runner.test.ts`：get/set/delete 快照同步+异步回写、addStyle 幂等、unsafeWindow、GM_info、同步/异步/TypeError 三类错误捕获、10s 超时 fake timer、window 快照 diff 零污染） |
| 注入调度器单测 | `vitest run` | ✓ 8/8（`injection-dispatcher.test.ts`：Method1 成功不降级、Method1 失败降级 Method2、全降级到 Method4 且总尝试 3 次、站点缓存命中跳过已证伪方法、失败记录 7 天后重新可用、tab-closed 100ms 重试成功、脚本运行时抛错不阻断、10s 无信号映射提示语） |
| 全量回归 | `vitest run` | ✓ 126/126（10 个测试文件） |
| lint | `eslint .` | ✓ 0 错误 |

## 三、交付物对应（P5-T1 ~ P5-T5）

- **P5-T1 注入调度器 InjectionDispatcher**（`src/service-worker/injection-dispatcher.ts`）：`injectScript(tabId, domain, code, gmGrants, storageSnapshot, runViaContent)` 按降级链 `[1,2,3]` 依次尝试，Method 1 直接调用 `chrome.scripting.executeScript({world:'MAIN', func: lubanRunScript, args:[...]})`（同一次调用内拿到返回值，不需要额外的桥）；Method 2/3 经注入方传入的 `runViaContent` 回调（SW 侧实现为「确保 content 已注入 + `tabs.sendMessage(INJECT_VIA_SCRIPT_TAG)`」）转发。任一方法失败且错误信息匹配 `tab was closed`/`No tab with id` 时等待 100ms 重试一次；全部方法失败后返回 `{ok:false, method:4, error:'该站点暂不支持自动注入。'}`，整条链路最多尝试 3 次（1 次/方法，无死循环）。`SiteCompatibility`（`chrome.storage.local`，Key `luban:site:{domain}`）记录最近成功方法与失败历史：成功时该方法置顶复用，7 天内的失败方法会被跳过、超过 7 天则重新纳入候选。
- **P5-T2 跨世界桥**（`src/content/event-bridge.ts`）：Method 2/3 走的是「页面真实 MAIN world」而非 `executeScript` 调用现场，没有直接返回值通道，因此用一次性随机事件名（`__luban_result_${crypto.randomUUID()}`）的 `CustomEvent` 做单向回传——事件名含 UUID，页面脚本猜不到也构造不出有效消息。Method 2 用内联 `<script>` 标签（`textContent`）；Method 3 用 `Blob` + `URL.createObjectURL` 生成的脚本地址。CSP 拦截内联脚本不会触发其 `error` 事件（规范层面是「静默不执行」），因此额外监听 `document` 的 `securitypolicyviolation` 事件，命中 `script-src` 相关指令时立即判失败（不必等满 15s 超时）；Blob URL 被 CSP 拦截时则会触发 `<script>` 的 `onerror`。两种情况都未命中时，15s 超时兜底 reject，避免 pending 请求永久悬挂。
- **P5-T3 GM_* P0 运行时**（`src/shared/injected-runner.ts` 的 `lubanRunScript`）：按 `gmGrants` 按需在 `api` 对象上挂载 `GM_getValue`（同步读预注入 `storageSnapshot` 快照）、`GM_setValue`/`GM_deleteValue`（更新内存快照 + 记录 `dirty` 增量，供调用方异步回写存储）、`GM_addStyle`（按 CSS 内容哈希生成 `data-luban-script` 标记，重复调用幂等——只会插入一个 `<style>` 节点）、`GM_info`（拼装脚本名/版本等元信息）、`unsafeWindow`（直接等于 `window`）。未在 `gmGrants` 中声明的 API 不会出现在 `api` 对象上，传给 `new Function(...)` 的参数列表天然不包含它，脚本体内引用该全局名时表现为 `undefined`——不是显式 stub，而是「从未存在过」，不会把未授权能力的实现代码一起打包进去。该文件被两条完全不同的路径复用：Method 1 直接把函数引用交给 `chrome.scripting.executeScript` 的 `func`；Method 2/3 取其 `.toString()` 源码拼进独立脚本文本——因此函数体内禁止任何 `import`/闭包捕获/模块级常量引用，所有状态（含超时时长字面量）都内联在函数体自身，已用 `grep` 校验构建产物中混淆后的函数体仍自包含（见 §二）。
- **P5-T4 脚本执行器**：同样落在 `lubanRunScript` 内——用户 `code` 被拼进 `new Function(...argNames, '"use strict";return (async function(){\n'+code+'\n})();')`，顶层包一层 `try/catch` + `.then/.catch`：正常结束 resolve `{ok:true, timedOut:false, dirty}`；同步或异步抛错都被捕获为 `scriptError`（`Error.message` + 可用时追加行号），`ok` 仍为 `true`（代表「注入执行机制」本身没坏，只是脚本自己出错，调用方据此不阻断页面、不触发降级链）；`setTimeout(…, 10_000)` 兜底，10s 内 `finish()` 未被业务逻辑调用则返回 `{ok:true, timedOut:true}`，映射为「脚本未正常结束（10s 内未收到完成信号）」提示。
- **P5-T5 注入链路端到端串联**：`PreviewView` 的「运行」按钮 → `App.tsx` 新增 `onRun()`：向 SW 发送 `INJECT_SCRIPT`（`code`/`gmGrants`/空的 `storageSnapshot`，预览阶段脚本未保存、无 `scriptId`，§五诚实边界已说明）；SW 新增 `handleInjectScript`：`resolveActiveTabId()` → `chrome.tabs.get` 取 `domain` → 调用 `injectScript(...)`，其中 `runViaContent` 实现为 `ensureContentInjected` + `tabs.sendMessage(INJECT_VIA_SCRIPT_TAG)`；content script 新增 `INJECT_VIA_SCRIPT_TAG` 分支调用 `runViaScriptTag` 并把结果包成统一响应回传。`App.tsx` 根据 `InjectionResult` 三态分流：`!ok` → `RUN_DONE('injection_fail', error)`；`ok && scriptError` → `RUN_DONE('runtime_error', scriptError)`；`ok && !scriptError` → `RUN_DONE('success', 'Method N · Xms')`，复用既有 `ResultView`（无需改动）。

## 四、待真人实测（阶段退出门，需真实浏览器加载扩展）

本阶段单测均为 mock chrome API 验证纯逻辑分支（降级顺序、站点缓存、GM 行为矩阵），`chrome.scripting.executeScript({world:'MAIN'})` 在真实站点的成功率、真实 CSP 下 Method 2/3 的实际表现、以及淘宝验收场景需要在 Chrome 中加载扩展人工验证：

| # | 验收标准 | 期望 | 状态 |
|---|----------|------|------|
| 1 | 淘宝（或任意商品页）点选价格元素 + 意图「把这个价格标红」→ 生成 → 预览通过后点「运行」 | 价格文字变红；`ResultView` 显示「运行成功」且 Method/耗时信息可见 | ☐ |
| 2 | 构造一个会抛错的意图（如要求脚本操作一个页面上明显不存在的选择器，诱导生成 `document.querySelector('.not-exist-xxx').click()` 之类代码） | `ResultView` 显示「脚本运行时出错」+ 错误摘要（含 TypeError 字样），页面本身不崩溃、Side Panel 不卡死 | ☐ |
| 3 | 要求脚本「给页面加个样式」（命中 `GM_addStyle` 授权），运行后再点一次「重新生成」+「运行」 | 两次运行后页面上只有一个 `<style data-luban-script>` 节点（幂等，查看 Elements 面板确认） | ☐ |
| 4 | 在一个已知带严格 CSP 的站点（如 GitHub）运行脚本 | Method 1（`executeScript world:MAIN`）本身不受页面 CSP 约束，预期仍直接成功；若观察到异常，需在 `chrome://inspect/#service-workers` 的 SW 控制台确认具体降级到了哪个 Method，并记录该站点到 `docs/spike-injection-results.md` 补充真实数据（§五已说明该文档当前仍是占位骨架） | ☐ |
| 5 | 关闭标签页的瞬间触发「运行」（或运行途中手动关闭标签页再快速重开类似场景不易稳定复现，可改为：运行请求发出后立刻 `Ctrl+W` 关闭当前标签） | SW 控制台可见一次 100ms 重试尝试；`ResultView` 不会无限等待，最终落在成功或「暂不支持」之一 | ☐ |
| 6 | 两次对同一域名发起运行（第二次换一个新生成的脚本） | 第二次运行明显更快命中同一 Method（可在 SW 控制台打点或靠主观耗时判断），侧面验证 `luban:site:{domain}` 缓存生效（也可直接在 `chrome://extensions` → 扩展详情 → 检查 storage 或用 DevTools Application 面板查看 `chrome.storage.local` 条目） | ☐ |

## 五、诚实边界（Phase 5 未实现，属已知局限或后续阶段）

- **P0 Spike 数据缺口**：`docs/spike-injection-results.md` 的 10 站点实测表格当时并未真正填写（全表仍是 `☐` 占位），本阶段的降级链实现严格按技术设计 §3.5 的默认顺序 `1→2→3→4`，但「Method 1 在真实站点成功率 ≥ 8/10」这一前提尚未经真实数据验证，需在上面的真人实测 #1/#4 中补充观察、必要时回填该文档。
- **GM 存储不持久化（预览态运行）**：`App.tsx` 的 `onRun()` 当前对未保存的预览脚本总是传空 `storageSnapshot: {}`，且 `handleInjectScript` 没有把注入返回的 `dirty` 增量写回任何持久化 Key——因为预览阶段的脚本还没有 `scriptId`，`GM_setValue` 在本次运行内生效，但下一次运行（哪怕是同一份代码）会从空快照重新开始。真正按 `luban:gm:{scriptId}` 隔离命名空间持久化、刷新重注入读到新值，要等 Phase 6（`SAVE_SCRIPT`/`RUN_SAVED_SCRIPT`）把脚本落库、有了稳定 `scriptId` 之后才有意义，当前这是预期内的阶段性局限。
- **Method 2/3 的真实可用性未知**：技术设计认为 Method 1（`executeScript world:MAIN`）本身就能绕过页面 CSP，降级链里的 Method 2/3 理论上只在极少数场景（如企业策略限制 `scripting` 权限的某些边界情况）才会被用到——这意味着 Method 2/3 的真实命中率可能长期是 0，相关代码路径的「真实浏览器下确实能工作」这一点，本阶段只验证了单测里的 mock 行为，没有找到一个会让 Method 1 失败的真实站点来触发真实的 Method 2/3（可考虑用 Phase 0 遗留的 CSP 测试页 `spike/fixtures/*.html` 补测，但那套页面不在当前扩展的 host_permissions / 可访问范围内，需要额外验证路径）。
- **「仅本次运行」与「保存后再次运行」尚未区分**：`onRun()` 目前只服务于预览态的一次性运行；`PreviewView`「保存」按钮调用的仍是 Phase 1 起就有的 `SAVE_SCRIPT`（落库但不自动运行），`RUN_SAVED_SCRIPT` 消息类型已在协议里声明但本阶段未实现 handler——这些都明确属于 Phase 6 范围（P6-T2）。
- **耗时展示粒度**：运行成功时 `RESULT.detail` 只拼了一句 `Method N · Xms` 的纯文本塞进 `ResultView` 的 `<pre class="detail">`（该元素本身只在非 success 态渲染，当前成功态其实不展示这段 detail），所以这段信息目前对用户不可见，只是预留在数据里；要不要在成功态也展示注入方法/耗时是产品决策，不在本阶段范围内擅自改 `ResultView` 的展示逻辑。
