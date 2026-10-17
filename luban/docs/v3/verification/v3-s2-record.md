# S2 MCP 执行记录

日期：2026-10-17。状态：实现、自动验证与包内启动器冒烟完成；用户选择暂不进行真实 Codex/Cursor + Chrome 业务联调，先交付实现和清单；阶段未验收关闭。

## 本轮实现

- 正式 `luban-mcp` stdio Adapter，严格输入 schema、结构化结果/错误、七个限定工具；与 Native Messaging 帧及 S0 health 探针隔离。
- `luban-mcp-enroll` 一次性 enrollment，独立客户端凭据文件 0600、本人所有、拒绝符号链接与覆盖；配置与日志不包含明文 token。
- pageRef/toolRef 服务端映射。页面授权绑定一个明确工作区，基线仅含当前代码与版本，不含会话、输入、GM 或历史代码。
- 提交沿用质量检查、CAS、租约/epoch 与本地 Approval；无任意 JS、保存/删除/恢复或内部消息透传。
- 稳定 requestKey 跨 RPC/重连去重；任务查询/增量事件；关闭客户端取消在途工作，迟到提交被拒绝。waitingUser 确认保留，需要主动取消或本地拒绝。
- 设置中的连接提示、独立配置示例与本阶段人工清单。

## 自动验证

环境：macOS arm64、Node 24.14.1；MCP SDK 1.32.1（固定依赖）。最新复验：扩展 49 个测试文件共 376 项通过，Bridge 43 项通过（含 8 项 MCP stdio 集成测试）；类型检查、lint、JS 语法检查、扩展构建通过。Bridge 新协议版本 0.2.0。

| 验收项 | 本轮证据 | 尚需真实验证 |
|---|---|---|
| A1 | SDK 实际 stdio + 独立 daemon IPC：空列表、服务器映射引用、伪造/跨 profile 拒绝 | 真实客户端发现与页面授权 |
| A2 | SDK 提交/查询真实 SQLite 任务；扩展 IDB 基线读取/候选检查 | Codex、Cursor 各自真实读取和提交，均未计通过 |
| A3 | 扩展质量检查、非法/截断/越权候选与版本 CAS 回归 | 无新增人工前置条件 |
| A4 | S1 本地 Approval 实际链路证据保留；S2 沿用同一入口 | 正式 MCP 发起→真实 Chrome 拒绝/确认 |
| A5 | SDK 跨 JSON-RPC ID、重连后任务查询与幂等 | 真实客户端闭环补充 |
| A6 | 七工具限定、伪造工具拒绝、撤销后读取缓存隐藏 | 真实客户端撤销补充 |
| A7 | stdio 关闭→cancelRequested→迟到 finish 拒绝→cancelled→重连查询 | 真实客户端关闭补充；不承诺撤销已产生副作用 |

测试的 browser 端使用协议模拟器；不能写成真实 Chrome 验收。客户端 SDK 是真实 newline stdio 通信，不代表 Codex/Cursor 模型已完成业务调用。

## 制品与证据

- 扩展：`luban/dist/`，等待正式扩展重新加载。
- 本机包：`luban/bridge/dist/luban-bridge-macos-arm64/`，内置 Node、Native Host、MCP/enrollment 启动器；注册路径不变，现有 daemon 仍可能运行旧代码，真实联调前须受控重启与检查。
- 包复制到含空格的临时路径、PATH 无 Node 的环境完成 Native IPC/配对/撤销与 MCP 七工具握手发现；未连接真实用户配对，不改变 Chrome 注册。不作为 S0 干净用户验收替代。
- 证据：`evidence/s2/2026-10-17/` 中 extension-tests、bridge-tests、lint、build、bridge-syntax、package-smoke 和 source-hashes。
- 操作说明：[MCP 连接说明](./v3-s2-mcp-setup.md)；[人工验收清单](./v3-s2-manual-checklist.md)。

## 本轮自动验收补充

用户要求将可自动验收项全部执行。已补充 7 个边界测试并复跑全量检查，当前 0 失败、0 跳过；详见 [S2 自动验收报告](./v3-s2-auto-verification-2026-10-17.md)。证据保存于 `evidence/s2/2026-10-17-auto-acceptance/`。自动部分通过不等于真实客户端联调通过。

## 待办与准出

用户于 2026-10-17 明确选择「暂不联调，先交付实现和清单」。真实客户端用例保留未执行，不计通过；当前无需用户执行清单。未修改现有 Codex/Cursor 配置；未新建真实 S2 配对、工作目录信任或页面授权。

后续用户决定恢复联调并明确临时范围后，完成 A2/A4 真实业务链路、客户端差异记录、清理证明和验收结论。不得宣布 S2 真实验收完成。用户随后明确要求继续 S3–S5 的实现与自动验收，所有真实用例统一留到末尾手动验证。S0 干净用户环境与 S1 双 Chrome profile 仍按用户决定延期，不重复要求。
