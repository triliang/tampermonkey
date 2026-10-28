# V4.1 修正协议后的复验记录

日期：2026-10-19。用户明确要求“重试”后，审批恢复，v41-3双后端真实复验已完成。

## 执行

复用现有MiMo mimo-v2.6-flash与本地Codex账号默认模型，四题各三次。命令：

```sh
python3 luban/scripts/evaluate-v41-existing.py \
  --profile "$HOME/Library/Application Support/Google/Chrome/Default" \
  --extension-id dggjjfgdfgicbbcknbdhbgpmmcebbfhg --live
```

同一完整Schema明文提供给两端；夹具、题集与金标未变，输入哈希与每题三次样本完整性已由compare-v41.mjs核对。

## 结果

| 后端 | 严格通过 | 失败 | 服务错误 | 未执行 | 中位延时ms |
|---|---:|---:|---:|---:|---:|
| MiMo | 11/12 | 1 | 0 | 0 | 5357 |
| 本地Codex | 12/12 | 0 | 0 | 0 | 6371.5 |

MiMo文章广告题第二次返回span与两个slide子区域，而金标要求完整aside容器，因此target-mismatch。该回答未误选正文，modify=false；没有执行任何页面修改，不能宣称实际广告残留或页面误伤。它没有满足完整容器范围约定，故仍计失败。统计数值两后端均3/3正确。

新增本地反例：在模拟父容器仍可见时，隐藏所有子片段不能使生产检查器将确认的完整父范围判为成功；未验证真实父容器自然收缩后的布局。新增后20项测试、4项检查与lint通过。未改模型协议、金标或产品代码来提高分数。

## 证据

- [本批原始JSON](./evidence/models-2026-10-19T05-40-16-674Z.json)
- [逐题对比](./10-model-comparison.md)
- [本地回归](./local/acceptance.md)

## 历史阻塞与当前准出

此前两次启动受自动审核超时/服务容量失败阻止，当时未执行。该阻塞本轮已解除，无需再次审批或提供密钥。

本轮复验已完成，但不满足全部样本通过的准出门槛。保留MiMo范围拆分偏差；真实Chrome/Native/视觉与多轮Harness本轮未覆盖。不能将小样本与不同输出约束下的差异当总体模型排名。
