# V4.3 第一轮自动验收

日期：2026-10-28（Asia/Shanghai）。依据 [47 号用例集](47-csdn-prompt-cases-2026-10-28.md)，总结果记录于 [49 号清单](49-computer-use-checklist-and-fixes-2026-10-28.md)。本轮由用户要求立即启动；不是定时任务已执行的证据。

## 实机结果

| 用例 | 结论 | 实际观察与证据 |
| --- | --- | --- |
| I23 动作冲突 | 通过（修复后） | 修复前请求“把所有广告隐藏或者删掉”没有追问动作，63 秒后因范围不完整结束，4 次模型、6 次工具；[原始界面](evidence/2026-10-28/computer-use/round3/I23-before.ax.txt)、[宿主记录](evidence/2026-10-28/computer-use/round3/I23-before-host.json)。修复后同一输入不到 1 秒询问选择隐藏还是删除，0 次模型、0 次工具，选集为空；[界面](evidence/2026-10-28/computer-use/round3/I23-after.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round3/I23-after-host.json)。 |
| T08 冲突后选隐藏 | 失败 | 同一对话第二轮输入“隐藏”，实际进入 hide 分析，46 秒后提示范围不完整；4 次模型、2 次工具，无选集与脚本。页面检索实际使用 HtmlRAG，记录 756 毫秒、HTML 视图截断；该时间不含模型等待。没有达到用例要求的草稿生成。[界面](evidence/2026-10-28/computer-use/round3/T08-final.ax.txt)、[宿主](evidence/2026-10-28/computer-use/round3/T08-final-host.json)。 |

I10 曾在页面被切换后发送到非 CSDN 测试页，前置不符合，结果排除；I10 仍为未执行。页面实际内容动态变化，不能将已读取范围视为所有目标。

![动作冲突修复后的回复](evidence/2026-10-28/computer-use/round3/I23-after.jpg)

## 修复与检查

对直接以“或者/还是/或”连接的不同处理动作，新增通用前置澄清；保留原用户请求，后续选择已实现的动作时在域层复核合并来源。引用解释、否定、顺序动作和不同目标等反例在回归中检查；不添加网站或广告特判。选择未实现动作时提示暂不可用。该机制针对保守识别的短动作选择，不代表所有自然语言冲突均已覆盖。

- [路由测试 78/78](evidence/2026-10-28/computer-use/round3/gateway-tests.log)、[Bridge 服务测试 15/15](evidence/2026-10-28/computer-use/round3/bridge-service-tests.log)。
- [扩展构建通过](evidence/2026-10-28/computer-use/round3/build.log)；[Bridge 打包](evidence/2026-10-28/computer-use/round3/bridge-package.log)后，在确认无运行任务及租约时[重启](evidence/2026-10-28/computer-use/round3/deployment.json)，重新加载扩展后实机复验。版本保持 0.4.3。
- 无生成、运行或保存脚本。补选动作进入分析不等于定位范围、生成草稿或完整业务目标完成。

## 仍需继续

累计 112 项：22 通过、4 失败、1 部分完成、19 待实现、66 未完整执行。完整一轮生成和范围识别仍有缺口；T08 本次真实失败。还需继续 I10 等独立用例、多轮目标继承、页面覆盖、动态与权限恢复验证，以及前轮记录的报告可读性问题。
