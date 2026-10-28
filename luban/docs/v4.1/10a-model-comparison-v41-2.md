> 历史中间批次：v41-2。最新结果见 [当前对比](./10-model-comparison.md)。

# V4.1 模型差异与优化复验

日期：2026-10-19T04:12:36.361Z。协议：v41-2。

[原协议基线](evidence/models-2026-10-19T04-09-22-859Z.json) · [优化后原始证据](evidence/models-2026-10-19T04-12-36-361Z.json)。脚本核对两批题集金标和夹具一致、每题双后端各三次、同批两后端输入哈希一致。基线与最终提示词不同，不是同一输入的前后因果试验。

## 逐题严格通过率

| 题目 | 后端 | 基线 | 优化后 |
|---|---|---:|---:|
| ad-article | third-party | 2/3 | 2/3 |
| ad-article | local-codex | 3/3 | 3/3 |
| ad-cards | third-party | 2/3 | 0/3 |
| ad-cards | local-codex | 3/3 | 3/3 |
| statistics | third-party | 2/3 | 1/3 |
| statistics | local-codex | 3/3 | 3/3 |
| chat | third-party | 3/3 | 3/3 |
| chat | local-codex | 3/3 | 3/3 |

## 所比较复验批次

| 后端 | 严格通过 | 服务错误 | 未执行 | 中位延时ms | 范围ms |
|---|---:|---:|---:|---:|---|
| third-party | 6/12 | 0 | 0 | 5540.5 | 3098–13725 |
| local-codex | 12/12 | 0 | 0 | 5639 | 3913–10324 |

- third-party：统计数值正确 1/3；这与整题协议通过率分别计算。
- local-codex：统计数值正确 3/3；这与整题协议通过率分别计算。

## 未通过项

- third-party / ad-article / 2：schema。
- third-party / ad-cards / 1：schema。
- third-party / ad-cards / 2：schema。
- third-party / ad-cards / 3：invalid-selector, target-mismatch。
- third-party / statistics / 1：statistics-mismatch。
- third-party / statistics / 2：statistics-mismatch。

## 可比性与解释

第三方使用既有MiMo mimo-v2.6-flash、JSON模式、temperature=0；最终显式沿用thinking=true。该中间协议未明确targets数组元素类型；这一提示词缺陷会混淆模型与协议因素，不能用其得分下模型优劣结论。Codex使用账号默认型号/采样、严格JSON Schema，精确模型型号未确认。两后端基础指令与HTML相同，Codex额外开发者约束与Schema不同；不能声称完全受控的纯模型排名。基线第三方未显式设置thinking，该差异也影响前后归因。

严格通过率包含目标集合、字段与类型、完整性和修改声明，并非只衡量算术。输出未执行，不能把目标引用偏差等同于实际页面误伤。每题三次仅为小样本冒烟；未验证生产Harness多轮工具、真实视觉、动态分页或长期稳定性。

本轮优化没有修改HTML和金标；没有删除失败样本、选择最佳重复或把错误计为通过。剩余偏差应保留为后续通用反例。

## v41-3修正与执行阻塞

复核确认v41-2删除了原提示词中的数组元素类型描述，导致MiMo返回selector对象或HTML。该回退属于评估协议缺陷，不能简单归咎于模型。v41-3已将完整Schema明文提供给两后端，明确CSS选择器字符串数组、统计均值精度，金标不变。本地检查通过，真实复验尚未启动。

最后两次启动均受自动审批服务故障阻止：首次审核超时，允许的一次重试返回Selected model is at capacity。工具明确这是审核失败，不是操作不安全的判定。没有绕过审批继续调用，也没有把旧批次改成v41-3结果。
