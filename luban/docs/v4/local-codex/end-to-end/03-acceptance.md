# 真实完整链路验收

日期：2026-10-19，Asia/Shanghai。实际 Chrome 原生侧栏 + 已注册 Bridge 0.6.7 + 本机 Codex 0.163.0-alpha.10.2。测试页是自建的博客园公开首页，原用户页面不变。

## 已通过项目

| 项目 | 实际观察 | 证据 |
|---|---|---|
| 普通聊天 | 执行方选择本地 Codex；实际返回“先明确需求再生成；青石-731”；未采集页面、未生成 | chat-and-memory.txt |
| 多轮记忆 | 后续只问上一轮代号，回答“青石-731”；使用同一会话 | chat-and-memory.txt |
| 页面授权 | 明确点击授权识别，得到40个结构候选，未预判业务用途 | analysis-proposal.txt |
| 模型分析 | 原生工具事件 read_page_context → propose_targets；建议候选22完整横幅，未确认和生成 | analysis-proposal.txt / real-ui-flow.json |
| 目标与生成授权分离 | 确认所选并采用隐藏方案后，生成按钮仍禁用；单独批准后才能生成 | generated-candidate.txt / 实际界面记录 |
| 真实候选 | Codex返回完整单目标CSS候选，无网络/额外权限；本轮仅一次generation.started | real-ui-flow.json |
| 质量检查与草稿 | 点击检查并应用，原质量门禁通过；尚未运行，保存按钮禁用 | generated-candidate.txt / trial-effect.txt |
| 单独试运行 | 显式点击运行；目标22已隐藏，仍可见0处；检查763处非目标区域，异常0处 | trial-effect.txt / success.png |
| 模型效果复核 | 模型准确引用763处无异常，并说明iframe、Shadow DOM、语义及交互未验证；未再生成或保存 | effect-review.txt |
| 重启续聊 | 会话215872ba在0.6.6→0.6.7实际进程切换前后持续存在，重连后成功继续多轮聊天与后续流程 | runtime-upgrade-end-to-end.json / real-ui-flow.json |
| 最后DOM复查 | 选择器唯一匹配1个元素，display:none；导航可见、20篇文章可见 | final-dom.json |
| 清理 | 已关闭自建辅助页和真正试运行页；无脚本保存，无自动运行 | cleanup.json |

证据目录：[真实UI证据](../../verification/evidence/local-codex/end-to-end/)。升级证据：[实际Bridge切换](../../verification/evidence/local-codex/runtime-upgrade-end-to-end.json)。

## 自动门禁

最终 `node luban/scripts/verify-v4.mjs --package`：12/12 检查通过，561/561测试通过（扩展455、Bridge89、Harness17）。扩展类型/lint/构建、通用能力边界、Bridge打包及重新定位烟测均通过。`git diff --check`通过。

[最终自动记录](../../verification/v4-auto-verification.md)。模型响应、工具循环、生成和试运行另有真实UI证据，未用自动测试冒充真实验证。

## 失败与范围

真实侧栏初次调用确实失败，保留在完整聊天证据中。随后定位并修复账户UI预检及Worker错误回传，升级后全部上述成功。浏览器工具的权限审核超时、前台用户切换、禁用扩展协议新标签导航均未计为成功，也未绕过协议策略。

本次仅验证一个已确认横幅的处理，不代表全站广告处理或所有未来模型/网络状态均通过。没有点击“效果符合，保存”，没有更改账号登录状态或使用真实额度耗尽场景。
