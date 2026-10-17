# S2 自动验收结果

日期：2026-10-17。结论：**当前 S2 可在隔离环境完成的自动验收全部通过，0 个失败、0 个跳过；真实 Codex/Cursor 与 Chrome 业务联调按用户选择暂缓，S2 整体尚未验收关闭。**

## 检查结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 扩展全量回归 | 49 文件，376 项通过 | [extension-tests.txt](./evidence/s2/2026-10-17-auto-acceptance/extension-tests.txt) |
| Bridge 全量回归 | 43 项通过，含 8 项 MCP stdio 集成测试 | [bridge-tests.txt](./evidence/s2/2026-10-17-auto-acceptance/bridge-tests.txt) |
| TypeScript / ESLint | 通过，退出码 0 | typecheck.txt、lint.txt |
| Bridge JS 语法检查 | 通过 | bridge-syntax.txt |
| 扩展生产构建 | 通过 | build.txt |
| 本机包搬迁冒烟 | 含空格路径、无全局 Node PATH；Native IPC、配对/撤销、MCP 七工具发现通过 | [package-smoke.json](./evidence/s2/2026-10-17-auto-acceptance/package-smoke.json) |
| 制品一致性 | 包内全部 Bridge src 与当前源码 SHA-256 一致；扩展 dist 与包入口摘要已归档 | source-hashes.json、artifact-hashes.json、[summary.json](./evidence/s2/2026-10-17-auto-acceptance/summary.json) |

环境：macOS 26.6.2 arm64，Node 24.14.1，Bridge 0.2.0，MCP SDK 1.32.1。全部证据在 `evidence/s2/2026-10-17-auto-acceptance/`，与上一轮快照分开保存。本轮新增 7 个测试，未修改产品运行逻辑。

## 按验收标准逐项结论

| 项目 | 自动验收结论 | 实际验证内容 | 剩余真实环境项 |
|---|---|---|---|
| S2-A1 页面与引用隔离 | 通过（自动） | 无授权空列表；仅当前 profile 页面可见；无 workspace ID 泄露；伪造引用、错误页引用拒绝；只读授权不暴露 toolRef；重绑工具使旧引用失效 | Codex/Cursor 真实发现与 Chrome 授权体验暂缓 |
| S2-A2 真实客户端读取、提交 | 自动子项通过；真实验收未执行 | SDK 真实 stdio/Unix IPC 提交、查询、结果字段裁剪；扩展 IDB 读基线、写草稿，保存工具不变 | **必须分别补 Codex 与 Cursor 的实际读取和候选提交**；不计该整项通过 |
| S2-A3 候选质量与版本保护 | 通过（自动） | 语法错误、截断代码、越权 grants、负 revision、缺 key、额外内部字段、UTF-8 超限拒绝；旧 revision、并发租约不覆盖最新草稿；冲突副本保留 | 无强依赖人工项 |
| S2-A4 本地确认执行 | 通过（自动）；真实联调未执行 | MCP 申请等待、拒绝返回 cancelled/rejected；新 key 新申请；本地确认推进 epoch/回执；重复 key/重复确认不产生第二个任务或执行；页面/代码变化使确认失效 | **MCP → 真实 Chrome 拒绝/确认 → 实际 DOM/回执**暂缓；不计真实网页执行通过 |
| S2-A5 重试与恢复 | 通过（自动） | 不同 JSON-RPC ID 使用同 requestKey 返回同 task；关闭重连查询终态；事件游标增量；丢失确认只重发结果；未知执行不重试 | 真实客户端的重连体验暂缓 |
| S2-A6 撤销与能力边界 | 通过（自动） | 撤销页面后缓存基线隐藏；撤销客户端后立即拒绝；其他客户端不能查/取消任务；不存在保存/删除/恢复/直接 JS/通用消息/远程批准工具；凭据权限与符号链接拒绝、拒绝覆盖 | 真实客户端撤销体验暂缓 |
| S2-A7 关闭、取消与迟到 | 通过（自动） | queued 主动取消；stdio 关闭使 running 进入 cancelRequested，旧 epoch finish 拒绝；cancelAck 后 cancelled 可重连查询；扩展采集迟到不提交；取消使待确认失效 | 真实客户端进程与 Chrome 联调暂缓 |

额外边界：100 KB 工具基线逐字完整返回；原始代码符合存储预算但 JSON 转义后超出传输预算时返回 BASELINE_TOO_LARGE，不静默截断。基线不含输入、历史对话、GM 或其他工作区。waitingUser 本地确认在客户端关闭后保留；关闭不等于拒绝，主动取消或本地拒绝才使其失效。未知结果不宣称副作用已撤销。

## 证据边界与剩余工作

MCP 集成测试使用真实 SDK Client/Server、独立子进程 newline stdio、私有 Unix socket、真实 SQLite；浏览器 Native 端使用协议模拟器。扩展服务测试使用 fake-indexeddb 和受控采集/试运行替身。因此这些结果证明协议、授权、持久状态和扩展服务规则，不能证明 Codex/Cursor 模型实际使用了七工具或 Chrome 实际执行了候选。

本轮未运行真实客户端、未新增真实配对或页面权限、未设置工作目录信任、未改日常配置或 Chrome 注册。临时测试状态由 fixture 清理；未接触用户保存工具。

**当前无需用户重复人工跑自动项目。** 仅保留 [人工清单](./v3-s2-manual-checklist.md) M01–M06 的真实联调，在用户决定恢复后执行；U01–U03 是遇到限制才需用户协助的条件项。之前延期的 S0 干净环境、S1 双 Chrome profile 仍未计通过。
