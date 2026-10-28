# Luban V4.1

本轮交付验收基础设施、红线、场景与证据，正式 PRD 已按用户确认补齐；v41-3复验完成：MiMo11/12、Codex12/12，仍有完整范围偏差；最终准出状态见报告。请优先阅读 [整体报告](./09-final-report.md) 和 [验收清单](./07-acceptance.md)。

1. [需求范围](./01-scope.md)
2. [PRD 状态](./02-prd.md)
3. [红线与评估标准](./03-redlines.md)
4. [技术方案与架构图](./04-technical-design.md)
5. [分阶段计划](./05-execution-plan.md)
6. [实施记录](./06-implementation.md)
7. [阶段验收清单](./07-acceptance.md)
8. [复核与优化一轮](./08-review.md)
9. [整体报告](./09-final-report.md)
10. [模型差异与优化复验](./10-model-comparison.md)
11. [修正协议复验记录](./11-follow-up-acceptance.md)
12. [当前系统架构](./12-current-architecture.md)
13. [界面、筛选精准度与脚本头评审](./13-ux-harness-script-review.md)

## 本地复验

```sh
npm --prefix luban run verify:v41
node luban/scripts/verify-v4.mjs --output docs/v4.1/integration
npm --prefix luban run eval:v41 -- --live
```

前两条不调用真实模型，不需要 Chrome。Bridge 集成测试需要本地 socket 权限。第三条调用真实模型；第三方需要 LUBAN_EVAL_BASE_URL（含兼容接口版本路径）、LUBAN_EVAL_MODEL、LUBAN_EVAL_API_KEY 环境变量；可选 LUBAN_EVAL_CODEX_MODEL 指定本地模型。不要把凭据写进仓库或聊天。缺配置、服务错误或答案失败退出非零；无 --live 只生成未执行清单。

## 夹具维护

HTML 位于 tests/v4.1/fixtures，均为合成数据，离线无外部资源。新场景添加 HTML、scenarios.json 金标、通用负例；评估题集、评分器与夹具均记录哈希。不要把夹具选择器复制进产品运行时。jsdom 模拟尺寸，真实布局变化需单独浏览器抽验。

## 复用已有扩展配置

用户已确认复用现有模型。可使用只读辅助入口，无需打开Chrome或手工复制密钥：

```sh
python3 luban/scripts/evaluate-v41-existing.py \
  --profile "$HOME/Library/Application Support/Google/Chrome/Default" \
  --extension-id dggjjfgdfgicbbcknbdhbgpmmcebbfhg --live
```

该扩展ID与本机当前Luban对应；换机器需指定实际Profile目录和扩展ID。辅助脚本只支持当前未压缩的LevelDB日志；若已压缩为SST会明确报错，不猜测凭据或覆盖配置。它不会修改Chrome存储，不打印密钥，仅通过子进程环境传给评估器。跨次读取可能受Chrome写入影响；如配置刚变更需重新执行，不缓存旧配置。通用环境变量入口仍可使用。
