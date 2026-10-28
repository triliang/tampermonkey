# 核实阶段搜索被拒后的收尾修复

日期：2026-10-27。承接用户反馈的两条通用模型失败提示，同时落实后续浅色紧凑气泡要求。

## 现场与计划

只读检查本机最新失败会话的状态和安全诊断：页面已绑定、identify、模型 6 次、宿主工具 5 次。`last-model-failure` 根因是 `HARNESS_TOOL_DENIED`，被归类成 `HARNESS_MODEL_FAILED`。在临时 checkpoint 副本中只提取工具名称和参数键，确认模型第六次提出 search_dom，此时宽泛搜索已关闭。没有读取或上传网页正文，副本已清理。

计划：保留阶段过滤，已知但当前阶段关闭的工具返回可恢复消息；未知/越权工具仍硬拒绝，调用总限不变。复现原顺序，验证最终报告与独立权限；气泡恢复浅色、缩减单行内边距。

## 实现

- Runtime 的阶段拦截返回匹配原 tool_call_id 的 ToolMessage，状态为未执行，明确要求利用已有证据收尾。被拦工具不派发到宿主，不重新开放搜索。
- 只有该任务本来允许的工具适用阶段收尾提示；内置文件工具、未知工具、identify 不允许的修改工具仍硬性拒绝。
- 拒绝请求计入进程内工具尝试预算；未实际派发不增加宿主页面工具次数。模型次数仍由宿主和本地双重限制为 8，工具 24、总时限 120 秒不变。持续无视提示也不能无限重试。
- 真正硬拒绝 `HARNESS_TOOL_DENIED` 正确归类为 `HARNESS_MODEL_TOOL_DENIED`，不再误归通用模型故障。
- 用户气泡改回 #edf1eb，恢复正文颜色；上下内边距各 6px，消除首尾段落默认 margin。未改变消息内容、折叠或授权逻辑，版本保持 0.4.3。

## 验收与复核

- Harness 全量 45 项通过，含第六轮被关闭搜索→第七轮报告→第八轮文本的真实 SDK 回归；未派发关闭搜索、tool_call_id 匹配、持续越限请求仍卡在 8 次、未知/修改工具硬拒绝均通过。
- [真实 Native 预算复现](evidence/2026-10-27/phase-recovery/native-budget.json)：12 项通过。第六次模型故意请求关闭的搜索，只有第一次实际搜索进入宿主事件，第七次收到可恢复回包并提交 incomplete，第八次结束；无模型失败、无范围确认或脚本副作用。真实 Chrome/Native/Worker，本地协议模型；不代表业务网页识别准确率。
- [浅色气泡与聊天回归](evidence/2026-10-27/light-chat-bubble/native-dom.json)：30 项通过。390px 侧栏单行用户气泡实测高 33.4375px、背景 rgb(237,241,235)、上下 padding 各 6px。保留角色标识移除、过程折叠、键盘、脚本弹窗、独立生成/运行/保存检查。
- 类型/构建/lint 通过，Bridge 包已更新。本轮没有重新执行完整扩展单测，展示改动由真实浏览器验证；前轮 520 项结果不冒充本轮重跑。
- 日常 Native 注册启动路径指向项目最新 Bridge 包；每个新请求的 Worker 会加载新 Harness 文件，无需因本次仅 Harness 的修复机械重启宿主。日常扩展仍需刷新才能显示浅色样式。未自动重试用户业务页或声称实际广告识别已完成。

复现入口：

```sh
node luban/scripts/verify-v43-native.mjs --entry --ui --budget-probe --phase-recovery
node luban/scripts/verify-v43-native.mjs --entry --dom --batch --ui --chat-process
```

使用 Node 24.14.1 和既有 Playwright/Chromium 路径，输出使用独立临时浏览器与 Native 状态；本轮完整日志保留在 phase-recovery 证据目录。
