# V2 P1 数据、迁移与恢复验证

日期：2026-10-13，Asia/Shanghai。状态：P1 实现及本阶段自动化/真实网页 IDB 检查完成；扩展内完整升级操作留待最终集成验收，不能把网页 origin 测试当作该证据。

## 授权与延期

用户要求“这2个点……最后测试。进行下一个阶段”。按上下文将 Chrome 138 与真实总容量/对话上限边界验收延期到最终测试，允许 P1 开始。P0 仍保留未全量退出状态，不改写为通过；小容量配置的自动测试不代替延期的真实边界验收。

## 实现

- `repositories/database.ts`：八个 IDB store，事务完成后才应答；错误中止、版本升级阻塞、应用逻辑容量守卫。
- `repositories/migration.ts`：只迁移脚本与关联 GM，原 id/代码保留、自动运行关、上一版为空；全批次事务与成功标志一起提交。失败不写成功标志、不删除旧备份；成功后停止旧业务键读写。
- `repositories/workspace-store.ts`：独立工作区/对话、草稿 revision、名称 CAS、typed GM delta、操作日志、未完成生成标 interrupted。
- `repositories/draft-buffer.ts`：500ms 防抖与离开前 flush；失败保留 pending 可重试；P2 接入实际 UI 离开流程。
- `script-store.ts`：原 UI 接口适配 IDB；旧 SAVE_SCRIPT 仅可新建，禁止覆盖已有 id；删除事务清理关联数据；有 pending 注册操作时阻止覆盖或删除。
- `workspace-router.ts` / `index.ts`：扩展来源精确校验、消息 schema、初始化 barrier、明确错误码。sender.tab 存在不会误拒真实扩展页。
- `shared/v2-types.ts` / `messages.ts`：类型与工作区消息；不混入 Key/设置。

P1 尚未实现 P3 的试运行凭证/版本提交，也没有实现 P4 的 Chrome 注册协调。pending 日志在启动时标 recovery_required 并保留，不能假装已恢复注册。

## 检查结果

| 检查 | 结果 | 证据 |
|---|---|---|
| npm test | 16 文件、180 测试通过；新增 19 项 P1 仓储/缓冲测试 | [日志](./evidence/p1-test.txt) |
| npm run typecheck | 退出 0 | [日志](./evidence/p1-typecheck.txt) |
| npm run lint | 退出 0 | [日志](./evidence/p1-lint.txt) |
| npm run build | 退出 0 | [日志](./evidence/p1-build.txt) |
| computer use / Chrome 155 | 正式仓储源码在普通 HTTP origin 的 8 项检查通过 | [可见结果](./evidence/p1-browser-result.txt) |

测试依赖 fake-indexeddb 6.2.5 已精确锁定，仅开发测试使用。浏览器检查使用 Vite 单独编译仓储测试入口，不打包进生产 dist。生产 manifest 未改变；用户既有源码修改未回退。

## 六类退出证据对照

| 验证类 | 已验证行为 | 方法 |
|---|---|---|
| 迁移 | A/B 脚本含漏索引数据、GM、旧宽规则；Key/设置不复制，enabled 不转自动 | 自动集成测试；浏览器迁移样本 |
| 中断/重试 | 数据无效或事务失败不半迁移；重试幂等；删除后备份不复活 | 故障注入集成测试；浏览器删除后重开 |
| 事务 | current/previous/revision 与日志中止后不变 | 集成测试；真实浏览器跨记录中止 |
| 并发 | 两连接同 revision 仅一份成功，旧草稿写入冲突不覆盖 | 集成测试；浏览器 CAS |
| 容量 | code/对话/总量守卫拒绝时原草稿/对话保留；并发总量增长仅一份成功 | 缩小限制的自动测试；真实1MiB/40MiB验收延期 |
| 恢复 | 草稿/输入/对话隔离，重开可恢复；generating 标 interrupted，不自动发请求 | 集成测试；真实浏览器连接重开 |

## 设计细化

- V1 迁移以原始快照计算版本 hash，然后用单个事务提交所有正文、GM 和成功标志。这里采用全批次原子迁移，不是可见的逐条半迁移；坏记录明确报错，先修复再重新启动。
- P1 应用容量按序列化记录 UTF-8 字节计数，含必要元信息；不是物理磁盘使用量。总量在同一全 store 事务内比较，防并发超限。当前实现每次写遍历业务记录，最终容量验收还需观察大数据下写入耗时。
- 旧数据超过新软上限时迁移仍保留，后续允许减少总量，不允许继续增长。读写事务失败不回退到旧 chrome.storage 仓储。
- GM 的新 typed delta 区分 null 与 delete；原 runner 的 null 删除协议仍由适配器兼容，P4 再统一运行时，不能据仓储测试宣称 runner 已升级。

## 待最终验收

1. Chrome 138 的完整 P0 兼容检查（用户明确延期）。
2. 真实 1 MiB 对话、40 MiB 总容量的边界/并发/性能检查（用户明确延期）。
3. 实际扩展 origin 的旧数据升级、SW 重启、P2 草稿 UI 与完整生命周期集成；网页连接重开不冒充扩展进程中断。
4. 数据量达到软上限时的写入延迟与空间不足提示，不静默删除用户数据。

代码与依赖摘要见 [SHA-256](./evidence/p1-source-sha256.json)。本次没有提交 Git、没有清除用户正式扩展数据。
