# V4.3 Computer Use 第二轮续验与修复

日期：2026-10-28（Asia/Shanghai）。基于 [47 号用例集](47-csdn-prompt-cases-2026-10-28.md)，总清单见 [49 号记录](49-computer-use-checklist-and-fixes-2026-10-28.md)。

## 结论

本轮新增执行 8 个逻辑用例，最新结果为 7 个通过、1 个部分完成。累计 112 项为：21 通过、3 失败、1 部分完成、19 待实现、68 未完整执行。**尚未完成全量验收，也未证明完整需求一轮生成全部通过。**

真实 Chrome 侧栏、真实配置模型 mimo-v2.6-flash、Thinking 开启。所有输入与点击由 Computer Use 完成；宿主数据库只读快照核对每轮模型/工具计数、目标与制品状态。N 组沿用无修改上下文的对话；I09、I17 与其复验均为独立新会话。测试代码不替代实际页面操作。扩展维持 0.4.3。

## 逐项结果

| 用例 | 结论 | 真实结果 | 证据 |
| --- | --- | --- | --- |
| N02 | 通过 | 1 模型/0 工具；说明具体排序权重不确定，不启动页面改造。 | [界面](evidence/2026-10-28/computer-use/round2/N02-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/N02-host.json) |
| N03 | 通过 | 1 模型/0 工具；给可能的排查方向，不断言实际原因，不生成脚本。 | [界面](evidence/2026-10-28/computer-use/round2/N03-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/N03-host.json) |
| N04 | 通过 | 1 模型/0 工具；能力询问未被当成执行授权。回复的能力示例仍有不够严谨之处，见续验记录。 | [界面](evidence/2026-10-28/computer-use/round2/N04-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/N04-host.json) |
| N05 | 部分完成 | 5 模型/9 工具；实际 HtmlRAG 305 毫秒。只读边界与覆盖提示符合预期，但关闭标记不能独立证明完整业务广告数量。 | [界面](evidence/2026-10-28/computer-use/round2/N05-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/N05-host.json) |
| N06 | 通过 | 1 模型/0 工具；明确具体原因无法确认，不自动隐藏。 | [界面](evidence/2026-10-28/computer-use/round2/N06-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/N06-host.json) |
| N07 | 通过 | 1 模型/0 工具；仅解释引号中的文字，无目标/计划/制品。内部字段泄露已修复；末尾仍有多余动作追问。 | [界面](evidence/2026-10-28/computer-use/round2/N07-clean-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/N07-clean-host.json) |
| I09 | 通过 | 1 模型/0 工具；仅追问对广告做什么，无选集、计划或脚本；回复例子提及未实现替换，作为文案缺口保留。 | [界面](evidence/2026-10-28/computer-use/round2/I09-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/I09-host.json) |
| I17 | 通过 | 修复前 2 模型/5 工具，错误推荐整条导航；修复后 1 模型/0 工具，只问具体对象，选集为空。 | [界面](evidence/2026-10-28/computer-use/round2/I17-retest-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round2/I17-retest-host.json) |

## 已修复

1. 普通聊天曾进入页面分析的提示/工具环境。新增 conversationOnly 模式：仅保留需求记录工具，旧的或异常页面工具调用不能下发。聊天改用独立提示；页面读取、生成及原有授权仍由原链路核验。真实 N02/N03/N04/N06/N07 复验均为 1 模型/0 工具，未生成或运行脚本。
2. 能力询问和引号里的动作词误触发页面路径。通用问句/引用规则将其保留为对话；明确只读数量请求进入 identify。没有加入网站或广告识别特判。
3. 普通聊天上下文泄露 pageBound:false。移除无关内部状态后实机复验已消除；[修复前界面](evidence/2026-10-28/computer-use/round2/N07-final-final.ax.txt) 与 [修复后界面](evidence/2026-10-28/computer-use/round2/N07-clean-final.ax.txt) 均保留。
4. “隐藏那个”无上下文时读页面并猜整条导航。新增无既有目标时的独立指代分流；有已有目标或明确命名区域仍走页面实时核验。修复前 2 模型/5 工具，复验 1 模型/0 工具且选集为空。没有自动确认猜测范围。

![指代缺项修复后的实际回复](evidence/2026-10-28/computer-use/round2/I17-retest-final.png)

## HtmlRAG 与只读统计的实际证据

N05 实际使用 htmlrag-bm25，记录剪枝 305 毫秒、100 个块、528 字符上下文，HTML 投影截断；不是 BM25 回退。整轮仍用了 5 次模型和 9 次工具，305 毫秒不包含采集与模型等待，不能据此声称整体耗时显著改善。

报告说明约 800/1350 节点采样与 iframe/Shadow DOM 未覆盖，并明确未生成或运行脚本。报告将一个“广告”关闭标记列为可确认元素，尚不能证明关联业务广告的完整边界或完整数量，因此 N05 只记部分完成。未用语义推测替代边界核实。没有做固定页面同输入的 HtmlRAG/BM25 配对实验，本轮不能判二者识别优劣。

## 回归与部署核对

- [Harness：67/67](evidence/2026-10-28/computer-use/round2/harness-tests-final.log)，含真实 SDK 工具隔离与异常工具不下发验证。
- [Bridge：130/130](evidence/2026-10-28/computer-use/round2/bridge-tests-final.log)，真实 worker 协议及进程树测试。问候快捷路径后，测试改用需真实模型处理的输入以保留原有验证强度。
- [此前界面/路由：66/66](evidence/2026-10-28/computer-use/round2/ui-tests.log)。[指代补充回归：71/71](evidence/2026-10-28/computer-use/round2/reference-tests.log)。两者有重叠，不能相加当作独立通过数。
- [扩展最终构建](evidence/2026-10-28/computer-use/round2/extension-build-final.log)通过；扩展已重载，I17 以重载后的新会话复验。Harness 与 Bridge 前段修复已构建、打包和重启后复验，部署记录与当前源码摘要位于证据目录。
- 测试中发现导入缺失以及旧用例将无上下文“这个区域”直接判作可操作的问题，已修正导入与旧测试前置；新增有既定目标及明确命名区域反例，未放宽生产权限。失败初态不计通过。

## 仍需处理

- N07 末尾仍有多余的改造追问；I09/N04 的示例能力文案存在超出当前 hide/dim 编译能力的内容，尚需统一。
- N05 默认报告仍展示 search_dom、TARGET_STALE 等内部名称；主流程应使用可理解的描述，同时保留诊断证据。该文案缺口未因工具隔离通过而标为已修复。
- 目标边界、采样截断、失效节点恢复与完整数量尚未闭环；新增指代规则只覆盖独立短指代，不声称解决任意自然语言指代。
- 剩余 68 项尚未完整实机执行，19 项能力未实现，原 3 项失败保留。故障注入、保存、跨布局、键盘/缩放与一轮完整生成仍须继续验收。

证据：[本轮输入与观察](evidence/2026-10-28/computer-use/round2/runs.json)、[当前源码与制品摘要](evidence/2026-10-28/computer-use/round2/source-hashes.json)。未导出账户配置、Cookie 或令牌。
