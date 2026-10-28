# v4.3 分阶段验收记录

> 2026-10-26 进度更新见 [继续实施与验收](23-continuation-2026-10-26.md)。本文原日期的实施、断点与验收结果保留，不覆盖后续代码；当前关键真实链路已补验，但完整发布门槛仍有未完成项。

日期：2026-10-20；补充验收：2026-10-21。当前结论：核心检查通过；10月21日追加真实Codex/Native/页面/运行保存链路、UI按钮、Tampermonkey及原生缩放验收。最新逐项状态以[剩余验收清单与结果](12-remaining-acceptance.md)为准；完整发布验收仍未完成。

## 一、可重复命令与结果

| 层级 | 命令/环境 | 结果 | 证据 |
|---|---|---|---|
| 扩展 | `cd luban && npm test -- --reporter=dot` | 63 个测试文件、476 项通过 | [完整记录](evidence/extension-tests.txt) |
| Harness | `cd luban/harness && npm test` | 27 项通过，实际SDK与SQLite运行 | [完整记录](evidence/harness-tests.txt) |
| Bridge | `cd luban/bridge && npm test`，允许临时本机socket | 93 项通过，含实际Worker与本机协议模型 | [完整记录](evidence/bridge-tests.txt) |
| 扩展构建/类型 | `cd luban && npm run build` | TypeScript与Vite构建通过 | [记录](evidence/extension-build.txt) |
| Harness构建/类型 | `cd luban/harness && npm run build` | 通过 | 生成 `harness/dist` 后运行上述测试 |
| 静态规范 | `cd luban && npm run lint` | 通过 | [记录](evidence/lint.txt) |
| Bridge检查 | `cd luban/bridge && npm run check` | 通过 | 本轮执行 |
| 差异格式 | `git diff --check` | 通过 | 本轮执行 |

测试合计 596 项通过，不包含真实模型探针和真实浏览器探针。基线为扩展461/Harness17/Bridge89；新增/调整的测试围绕实际边界，不将旧版通过结论直接沿用。

## 二、Loop 专项自动验收

| 检查点 | 结果 | 实际覆盖 |
|---|---|---|
| L1：真实Worker+Deep Agents+外层图+页面结果往返 | 通过 | 本机协议模型，实际子进程/IPC/持久领域；页面结果由测试宿主返回，不是真实Chrome Native往返 |
| L1：用户排除、未复核提议、外层异议路由、无进展停止 | 通过 | 领域及真实LangGraph节点 |
| L1：增量身份、稳定编号、嵌套、节点替换、cursor失效 | 通过 | 生产TargetRegistry、jsdom真实节点与跨布局夹具 |
| L2：越界/换动作/选择器注入拒绝 | 通过 | IR与编译器反例 |
| L2：固定生成操作、有限修订、唯一候选、宿主核验 | 通过 | 实际生成图及实际Worker生成路径 |
| L2：中断重建不能绕过批准 | 通过 | SQLite关闭重建和真实框架Command恢复 |
| L3：独立运行、结果未知、旧epoch和重复请求 | 通过 | 既有版本/操作服务回归与新增边界检查；真实userScripts执行补验通过（见第七节），尚未Native全链路验收 |
| L3：失败/缺失/截断效果报告不能仅靠人工标记保存 | 通过 | 后端Gateway保存门禁反例，旧无绑定流程仍保留原门禁 |
| 读写/工具边界 | 通过 | 文件/命令等内置工具不暴露；普通咨询无隐式生成/运行 |
| 隐私 | 通过 | 可编辑根与子节点、相邻表单/脚本内容从证据排除 |

生产隔离夹具验证服务未实现；隔离执行仅在测试中运行可信编译产物，未执行模型任意代码。此限制在实施记录中明确。

## 三、真实模型探针

通过现有本地 Codex 登录，实际运行 Deep Agents，只提供合成证据，不访问真实网页或执行候选。CLI兼容检查：`0.163.0-alpha.10.2`，限制开关与协议检查通过。模型使用账号默认模型，未固定模型版本，因此不能据此作稳定基准对比。

| 样例 | 预期与实际 | 结果 | 证据 |
|---|---|---|---|
| 弱化提示，保留主内容 | 只选择 notice，先inspect和review | 通过，约34.5秒 | [JSON](evidence/live-codex-probe.json) |
| 完整容器与嵌套子节点 | 只选择 panel，不重复选择 panel-text | 通过，约39.8秒 | [JSON](evidence/live-codex-nested.json) |
| 仅普通咨询 | 不筛选目标、不调领域工具 | 通过，约7.6秒 | [JSON](evidence/live-codex-chat.json) |

命令：`node luban/scripts/verify-v43-live.mjs --live`；增加 `--nested` 或 `--chat` 对应其余探针。受限环境首次运行出现 AGENT_DISCONNECTED，允许本机模型进程后重新验证通过；未将初次失败掩盖为准确性结果。

三个样例不足以证明整体准确率、召回率或误伤率改善；未完成 A/B/C/D 对照，也未冻结质量阈值，禁止报告“准确率已提高某百分比”。

## 四、真实浏览器验证

最初：Playwright默认浏览器缺失，已安装的日常Chrome未加载测试扩展。随后将测试专用 Chromium 下载到临时目录，在一次性profile中加载**实际构建扩展**，未修改日常Chrome配置。

环境：Chrome for Testing `151.0.7922.34`。结果：[浏览器报告](evidence/browser-verification.json)。

- 实际扩展Service Worker加载，设置概览及服务详情可达。
- 服务详情390px视口无页面横向溢出，无页面JavaScript错误。
- 可信IR编译输出在三种真实浏览器合成布局中正确隐藏目标，保留区域仍显示。
- 此效果验证使用fixture页面上的受控脚本注入；不是扩展 userScripts API 或 Tampermonkey 的完整验证。
- Native Messaging 与 Tampermonkey 均未接通，报告明确为 false。

截图：[扩展设置概览](evidence/extension-options.png)、[窄屏服务详情](evidence/extension-service-narrow.png)。

可重复脚本：`scripts/verify-v43-browser.mjs`，通过 `LUBAN_PLAYWRIGHT_MODULE` 指向已有Playwright模块、`PLAYWRIGHT_BROWSERS_PATH` 指向测试浏览器目录。本次只使用临时配置，结束后关闭浏览器并删除profile。

## 五、PRD 验收追踪

| AC | 当前结论 | 限制 |
|---|---|---|
| 01 | 普通咨询边界通过 | 真实Codex合成样例也通过 |
| 02 | 真实Worker/图自动分析通过 | 浏览器Native端到端尚未完成 |
| 03 | UI消息、过程、决策分离自动检查通过 | 完整侧栏可用性人工走查待补 |
| 04–06 | 排除、集合复核、身份/cursor反例通过 | 真实动态网页需补样本 |
| 07 | 独立生成批准、自动调度通过 | 生产批准权威仍在宿主，不重复搬到第二套图状态 |
| 08–09 | 查看不修改、应用显式、版本/授权变化通过 | 任意手改代码不进入自动修订验证器 |
| 10–12 | 局部检查、保留、预算、未知状态和epoch反例通过 | 真实注入和文档失效已补验；Native联调与崩溃时间窗待补 |
| 13 | 完整头、复制/导出一致与权限校验通过 | 旧正文格式不静默批量升级 |
| 14 | **未完成** | Tampermonkey安装、匹配、加载时机与GM兼容仍需独立验证 |
| 15 | 设置保存/测试隔离自动检查及真实扩展界面通过 | 真实API服务各类失败、模型能力矩阵未全覆盖 |
| 16–17 | 草稿/视图及IME、历史操作隔离回归通过 | 完整读屏、200%缩放、低高度人工走查未完成 |
| 18 | 增量格式兼容、旧pending失效通过 | 实际用户大体量数据迁移/降级演练未完成 |
| 19 | 工具、来源、敏感编辑内容等反例通过 | 不代表任意恶意脚本的安全沙箱认证 |
| 20 | 跨布局编译及局部模型探针通过 | 四组准确性/成本对照与金标规模未完成 |

## 六、首次验收时的发布门禁（后续进展见第八节）

自动检查通过可用于继续评审，但正式发布仍需：真实Chrome→Native Host→Harness→页面→运行回执全链路；Tampermonkey独立验收；代表性准确性与成本对照；完整可访问性及迁移演练。不能以本地Demo、三份模型样例或模板fixture替代。

## 七、2026-10-21 补充验收

### 可搬迁 Bridge 安装包

按项目要求使用绝对路径 Node v24.14.1 重新打包，再运行 `bridge/scripts/smoke-bridge-package.mjs`。首次命令受环境命令代理影响实际用了 v24.3.0，被打包版本门禁拒绝；切换正确运行时后通过，未放松门禁。

[原始结果](evidence/package-smoke.json)：临时带空格路径搬迁、打包自带 Node、真实宿主进程与本机 IPC、配对/撤销、无页面授权拒绝访问、Harness/适配器加载、MCP 7 项工具发现均通过。未修改用户 Native Host 注册，`realChromeRegistration=false`；该检查不能替代 Chrome connectNative 完整链路。

### 真实 userScripts API 与生产试运行模块

[原始结果](evidence/execution-browser.json)，复现脚本：[verify-v43-execution.mjs](../../scripts/verify-v43-execution.mjs)。使用同一测试专用 Chromium，临时 profile 中加载构建扩展副本；副本仅增加 `http://127.0.0.1/*` 测试权限，未修改项目 manifest 或日常浏览器。通过浏览器扩展详情开启/关闭用户脚本开关。将生产 `trial-runner.ts` 用现有构建器打包为验收入口，在实际扩展 Worker 中调用，执行真实 `chrome.userScripts.execute`，并验证真实 documentId 和回执；未用 script 标签模拟执行。

| 检查 | 结果 |
|---|---|
| 完整 UserScript 头通过生产 validateTrial，再真实执行 | 通过 |
| 目标隐藏、正文保留、样式仅插入一次、返回成功回执 | 通过 |
| 同一文档重复请求返回 repeated | 通过 |
| 导航刷新后不自动运行 | 通过 |
| 旧 documentId 注入被拒绝 | 通过 |
| 新 documentId 显式试运行成功 | 通过 |
| 顶部 grant 与结构化权限不一致被拒绝 | 通过 |
| 用户脚本开关关闭后拒绝执行，无回退注入 | 通过 |

初次尝试网页授权弹窗在无界面环境中超时，因此上述使用临时 manifest 的本地夹具权限；**没有把实际权限申请交互计为通过**。关闭开关时浏览器保留 API 对象，但调用返回 `userScripts.execute is not available in this context`；验收断言按实际拒绝结果校验，而不是仅匹配自定义错误文案。

这 7 项执行检查与安装包探针不计入此前 596 项单元/集成测试数字。没有修改产品代码；新增可重复验收脚本与证据。

### 第七节完成时仍未完成（现状见第八节）

- Chrome → Native Messaging → Harness → 真实页面证据 → 用户独立批准 → 执行回执 → 保存的完整 UI 链路。当前仅分段验收通过，不能拼接声称端到端通过。
- Tampermonkey 实际安装、域名匹配、加载时机、GM 兼容（AC-14）；本机未发现可直接复用的 Tampermonkey 测试配置，未修改日常浏览器安装。
- A/B/C/D 质量/成本对照、读屏和完整缩放低高度检查、真实用户迁移/降级演练。
- 生产隔离验证宿主、完整图级运行/保存恢复仍属于未实现范围，不能通过追加验收消除。

## 八、2026-10-21 剩余清单执行结果

完整步骤、标准、复现入口和未完成原因见[12-remaining-acceptance.md](12-remaining-acceptance.md)。本节替代前文历史记录中的Native/Tampermonkey未接通结论。

| 新增验收 | 本轮结果 | 证据 |
|---|---|---|
| Native协议模型真实链路 | 13项通过 | [JSON](evidence/native-e2e.json) |
| 真实Codex+Native+实际页面+生成运行保存 | 13项通过 | [JSON](evidence/native-e2e-live.json) |
| 侧栏关键按钮、只读查看/应用、焦点恢复、运行保存 | 15项通过 | [JSON](evidence/native-e2e-ui.json) |
| Tampermonkey5.5.1完整原文安装/匹配/保留；六GM×三时机 | 7项断言通过，后3项各含六种能力 | [JSON](evidence/tampermonkey-browser.json) |
| 当前L1真实模型金标 | 6题各1次均符合金标；未作四组对照 | [JSON](evidence/model-matrix.json) |
| 初始侧栏/设置窄屏低高度与原生200% | 6项通过；33个可见控件基本命名检查未发现问题 | [JSON](evidence/accessibility-browser.json) |
| 实际Chromium IDB升级/中断/重开 | 5项合成数据检查通过 | [JSON](evidence/migration-browser.json) |
| 定向迁移/恢复回归 | 23项通过，是原596项子集 | [日志](evidence/migration-recovery-tests.txt) |
| 静态检查 | lint、验收脚本语法与差异格式通过 | [lint日志](evidence/followup-lint.txt) |

Native采用临时扩展副本预授予本地夹具/native权限，以及临时user-data-dir注册和独立状态；未替换日常安装。真实模型链路与UI链路为分开运行的证据。真实数据、正式权限弹窗、复杂跨站任务、完整故障时间窗、读屏及四组比较不能据此标通过。生产隔离宿主及完整图级运行/保存恢复仍未实现。

## 工具栏入口授权回归补验

此前预授localhost权限的页面链路没有覆盖工具栏activeTab授权。用户反馈后，使用原始构建、不预授夹具host权限、真实Chrome扩展action复现并修复；修复后网页URL/真实注入/生产路由恢复，4项通过；定向回归22项通过。细节见[14-active-tab-regression.md](14-active-tab-regression.md)。先前仅核对openPanelOnActionClick=true不能用作授权通过依据。
