# 用户提供的 P0 JSON 核对

原始附件按字节归档为 [runtime-export-chrome155.json](./runtime-export-chrome155.json)，SHA-256：`ae5078358f1b3707d94374ad06ed6d580e0df1a06f49add72037d1e3010556f0`。自动解析结果见 [analysis](./runtime-export-analysis.json)。

- 共 80 条事件；8 条 RUNNER_RESULT，2 次 BOOT_RECOVERY。日志有长度上限，不代表完整操作历史。
- A/B 真实执行记录均存在；每次执行 visits/promiseWrites/timerWrites 加 1，6 次增量回执，nullable 保留 null，removeMe 已删除。
- 两次 PREPARED→新 boot→BOOT_RECOVERY(current=A) 存在。JSON 不区分“仅停止 SW”和“重载扩展”的人为触发来源；两种操作的对应关系仍引用用户确认。
- IDB_ABORT passed=true，current=A/previous=OLD；CAPACITY_GUARD passed=true，262145 bytes 被 262144 bytes 守卫拒绝；GM_INFO 标准对象通过、旧调用拒绝。
- 导出时 current=B、previous=A、journal=null、注册 MAIN/document_end/B，与已提交版本一致。

## 快照时点与证据边界

**这份 JSON 是清理前快照**：auto=true、permission=true，且 registered 与 bridges 各有一项。不能用它证明已停用。原操作清单要求“先导出、再清理”，因此这与用户之后确认清理完成可以同时成立；清理后状态只有人工确认，尚无清理后 JSON。

缺桥超时、未提交 B 被拒、不匹配站点、权限关闭失败和手动 execute 没有相应结果事件留在本 JSON 中，仍由人工确认支持，不伪称全部都有机器日志。

同一 documentId 有重复 START_ALLOWED，但只有一条对应 RUNNER_RESULT，可能来自握手重试；本快照不显示重复正文执行。生产阶段仍应针对启动请求做幂等/lease 去重验证，不能据此假设幂等已经完成。

Chrome UA 为 155，不覆盖 Chrome 138、40 MiB 总容量、1 MiB 对话上限、磁盘 quota exhaustion 或 Tampermonkey 导出兼容。
