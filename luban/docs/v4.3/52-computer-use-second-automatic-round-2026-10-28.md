# V4.3 第二轮自动验收与续接修复

日期：2026-10-28（Asia/Shanghai）。用户要求继续下一轮，依据 [47 号用例集](47-csdn-prompt-cases-2026-10-28.md)；完整状态见 [49 号清单](49-computer-use-checklist-and-fixes-2026-10-28.md)。

## 新增实机结果

| 用例 | 结论 | 证据与观察 |
| --- | --- | --- |
| I10 排行榜 | 通过 | 在新的 CSDN 页面会话输入精确文本，10 秒后追问要做什么。1 模型/0 工具，无选集、计划、制品。[界面](evidence/2026-10-28/computer-use/round4/I10-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round4/I10-host.json)。示例仍提及未实现能力，未将文案问题写成已修复。 |
| I18 删除这个 | 通过 | 独立新会话，19 秒后询问具体对象。1 模型/0 工具，无选集、计划、制品。[界面](evidence/2026-10-28/computer-use/round4/I18-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round4/I18-host.json)。额外提到页面地址/文件，属于后续文案优化项。 |

以上仅按各行的缺项追问标准判定；不代表删除或统计等编译能力已实现。

## 多轮续接修复

代码路径与函数检查发现：冲突选择只接受非常简短的固定表达，“隐藏就好”“就隐藏吧”可能无法合并；先选择未实现的删除后待选上下文被清除，再改选隐藏会失去已验证的目标/约束合并来源。

本次修复严格识别明确的短选择，保留原目标与保留要求；对新目标、条件、否定或疑问不自动合并。未实现动作返回后保留原始待选请求，后续可改选。域层继续验证合并文本来源，拒绝伪造或目标变更的拼接。没有添加站点或广告语义特判。

实机复验使用三轮输入：

1. “把所有广告隐藏或者删除，保留导航”：不到 1 秒询问二选一。
2. “删除”：不到 1 秒说明暂不可用；[宿主](evidence/2026-10-28/computer-use/round4/choice-unavailable-host.json)确认 0 模型/0 工具且 pendingChoice 保留完整原请求。[界面](evidence/2026-10-28/computer-use/round4/choice-unavailable.ax.txt)。
3. “隐藏就好”：进入 hide 页面分析；最终 94 秒、4 模型/11 工具后仍为 incomplete，无选集、计划、制品，requirement 仍为空。[界面](evidence/2026-10-28/computer-use/round4/choice-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round4/choice-final-host.json)。

短回答已能继续分析、原请求中间态已保留；目标与保留约束的拼接有服务级回归。**实机没有形成结构化需求或完整可确认范围，不能声称保留约束已在最终脚本和效果中得到闭环。** 此为 T08 相邻变体，未作为额外逻辑用例计数，也未将既有 T08 失败改为通过。该轮实际使用 HtmlRAG，但仍未解决完整范围识别问题。

![多轮续接的实际最终状态](evidence/2026-10-28/computer-use/round4/choice-final.jpg)

## 验证与部署

- [路由回归 84/84](evidence/2026-10-28/computer-use/round4/gateway-tests.log)：明确短选择、否定、疑问、附加条件和新目标等反例。
- [Bridge 服务回归 16/16](evidence/2026-10-28/computer-use/round4/bridge-tests.log)：暂不可用后改选、原目标与约束合并、伪造来源拒绝。
- [扩展构建](evidence/2026-10-28/computer-use/round4/build.log)、[Bridge 打包](evidence/2026-10-28/computer-use/round4/package.log)通过；确认无运行任务后[重启服务](evidence/2026-10-28/computer-use/round4/deployment.json)，重载扩展，在新会话中复验。扩展版本仍为 0.4.3。git diff --check 通过。

累计 112 项：24 通过、4 失败、1 部分完成、19 待实现、64 未完整执行。范围识别和完整生成仍待修复；本轮并非全量验收通过。未运行、保存脚本或修改网站服务端内容。
