# v4.3 执行计划

> 2026-10-26 更新：P1–P4 已补齐当前 UI 的协议模型与真实 Codex 关键链路。预算、DOM 检索、CSSOM 补证及观测属于本次继续实施的新范围，记录见 [23](23-continuation-2026-10-26.md)。本文件“本轮不做”描述的是 10-22 原轮次，不再表示这些代码一概未实现。

日期：2026-10-22。依据 [总技术方案](05-technical-design.md)。本文件是当前编码入口。2026-10-20 的 S0–S4 与 [20](20-technical-review.md) 的 M0–M5 只保留历史，不覆盖本文。

目标：按已锁定规则接通主流程。只读可以结束，同一页继续聊天不清掉确认，修改任务才出现范围确认。

## 本轮不做

- 不注册生产 `revise`，不把运行和保存搬进图。
- 不合并两本预算账，不拆停止原因错误码，不定证据超时毫秒数。
- 不用现有 `plan.hash` 判断失效，不新造哈希库。
- 首次绑定仍用现有 scan。增量注册、DOM 检索、资源补证、向量召回、日常 Langfuse 另列。

## 顺序

### P1 失效三元组

文件：`bridge/src/harness-domain.mjs`。测试：`bridge/test/harness-domain.test.mjs`、`bridge/test/harness-v43.test.mjs`。

- 规范化：目标 id 去重后按字典序；action 只取 `hide`、`dim`，没有方案记空；约束先把连续空白收成一个空格、去掉首尾空白，再去重并排序。
- `propose_requirement` 和 `propose_plan` 用本次约束列表整体替换，不与旧约束取并集。
- 替换后按换页、目标、操作、约束的顺序比较。三者都不变则保留已确认范围、方案和生成授权。命中变化或无法规范化则三者一起作废。
- 比较不用 `plan.hash`。`plan.hash` 仍可留给生成批准，它含 `revision`，不能当失效键。
- `propose_targets` 只改未确认选择。已确认目标集合变化才走上面的作废。

退出：同一目标上只改解释不清确认；隐藏改弱化、增删约束、增删目标、换页会清掉范围、方案和生成授权。

### P2 宿主 outcome

文件：`harness/src/workflow.ts`、`harness/src/runtime.ts`、`harness/src/worker.ts`、`bridge/src/harness-service.mjs`、`bridge/src/harness-domain.mjs`。测试：`harness/test/workflow.test.mjs`、`bridge/test/harness-loop-worker.test.mjs`。

- 新增 `outcome`，不复用会话 `status`。
- 证据图按 `05` 的顺序赋值：`ready`、`TARGET_REQUIRED`、`needsEvidence`、`needs_clarification`、`incomplete`、`answered`、`stopped`。模型正文不能写成 `ready`。
- `intent=identify` 时 `review_selection` 允许空数组；`review_current_selection` 不因空选择返回 `TARGET_REQUIRED`。
- `intent=modify` 且还没有非空目标时返回 `TARGET_REQUIRED`，不写完成态。
- 生产生成图继续不传入 `revise`。编译失败即 `stopped`。

退出：只读空选择可以 `answered`、`incomplete` 或 `needs_clarification`。修改任务没有目标不会变成 `ready`。

### P3 分流与绑定

文件：`src/service-worker/index.ts`、`src/service-worker/services/harness-gateway.ts`、`harness/src/runtime.ts`、`src/sidepanel/v4/HarnessChat.tsx`、`src/sidepanel/v4/useHarnessChat.ts`。测试：`src/service-worker/services/harness-gateway.test.ts`、`src/sidepanel/v4/HarnessChat.test.tsx`。

扩展在调用模型前判断，顺序固定：

1. 已绑定且命中现有效果检查正则（检查、check、还在、隐藏不、效果、复核）：`harness.message`，附带现有检查，不进证据图。
2. 未命中词表：`harness.message`，不 bind。词表是：识别、查找、定位、当前页、这个页面、入口、元素、按钮、区域、隐藏、弱化。
3. 命中词表：有「隐藏」或「弱化」记 `intent=modify`，否则记 `identify`。都有则 `modify`。
4. activeTab 缺失或失效：不 bind，提示再次点击工具栏图标。不创建对话内读取按钮。运行时提示删掉「授权并识别当前页」。
5. 没有 page，或 `documentId`、`navigationEpoch` 变了：bind（现有 scan）后 analyze。
6. 同一文档：只 analyze，不 bind，不清已确认范围。

侧栏只有 `outcome=ready` 才显示范围确认。导航失效仍走「重新授权当前页」（scan → bind → analyze）。工具栏点击不写 `harness.bind`。

退出：`你好` 不采集。`识别当前页面入口` 在 activeTab 有效时绑定并进入证据图。同一页再说一句不重新 scan。只读结果不出现确认范围。

### P4 回归

- `bridge` 现有测试，覆盖 P1。
- `harness` 现有测试，覆盖 P2。
- 扩展里上述两个测试文件，覆盖 P3。
- 不把未跑的真实 Chrome、Native、模型或 Tampermonkey 标成通过。

## 验收

1. 未命中词表不采集。命中词表且 activeTab 有效才读取。权限不足不编造页面事实。
2. 只读以 `answered`、`incomplete` 或 `needs_clarification` 结束，不要求选修改目标，不生成或运行。
3. 三元组不变保留确认。改操作、改约束、增减目标、换页或节点替换时，范围、方案和生成授权一起作废。
4. 运行和保存仍只由扩展宿主裁决。
