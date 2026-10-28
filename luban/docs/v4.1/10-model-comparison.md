# V4.1 模型差异与优化复验

日期：2026-10-19T05:40:16.673Z。协议：v41-3。

[原协议基线](evidence/models-2026-10-19T04-09-22-859Z.json) · [优化后原始证据](evidence/models-2026-10-19T05-40-16-674Z.json)。脚本核对两批题集金标和夹具一致、每题双后端各三次、同批两后端输入哈希一致。基线与最终提示词不同，不是同一输入的前后因果试验。

## 逐题严格通过率

| 题目 | 后端 | 基线 | 优化后 |
|---|---|---:|---:|
| ad-article | third-party | 2/3 | 2/3 |
| ad-article | local-codex | 3/3 | 3/3 |
| ad-cards | third-party | 2/3 | 3/3 |
| ad-cards | local-codex | 3/3 | 3/3 |
| statistics | third-party | 2/3 | 3/3 |
| statistics | local-codex | 3/3 | 3/3 |
| chat | third-party | 3/3 | 3/3 |
| chat | local-codex | 3/3 | 3/3 |

## 所比较复验批次

| 后端 | 严格通过 | 服务错误 | 未执行 | 中位延时ms | 范围ms |
|---|---:|---:|---:|---:|---|
| third-party | 11/12 | 0 | 0 | 5357 | 3792–11109 |
| local-codex | 12/12 | 0 | 0 | 6371.5 | 4579–17062 |

- third-party：统计数值正确 3/3；这与整题协议通过率分别计算。
- local-codex：统计数值正确 3/3；这与整题协议通过率分别计算。

## 未通过项

- third-party / ad-article / 2：target-mismatch。

## 可比性与解释

第三方使用既有MiMo mimo-v2.6-flash、JSON模式、temperature=0；最终显式沿用thinking=true。同一份完整JSON Schema已明文提供给两端。Codex使用账号默认型号/采样、严格JSON Schema，精确模型型号未确认。两后端基础指令与HTML相同，Codex额外开发者约束与Schema不同；不能声称完全受控的纯模型排名。基线第三方未显式设置thinking，该差异也影响前后归因。

严格通过率包含目标集合、字段与类型、完整性和修改声明，并非只衡量算术。输出未执行，不能把目标引用偏差等同于实际页面误伤。每题三次仅为小样本冒烟；未验证生产Harness多轮工具、真实视觉、动态分页或长期稳定性。

本轮优化没有修改HTML和金标；没有删除失败样本、选择最佳重复或把错误计为通过。剩余偏差应保留为后续通用反例。
