# S0 依赖与实施参数

日期：2026-10-16。状态：本轮个人试点依赖与参数冻结；仅覆盖以下已测环境。干净用户环境由用户暂缓，其他 OS/架构和公开稳定发行不在当前兼容声明内。

| 对象 | 本轮版本/取值 | 验证状态 |
|---|---|---|
| 本机 OS/架构 | macOS 26.6.2 (25G83) / arm64 | 仅当前环境；最低系统版本和其他架构未验证 |
| 内置 Node | 24.14.1 / arm64 | 打包与含空格路径迁移 smoke 通过；干净用户环境待验 |
| MCP SDK | @modelcontextprotocol/sdk 1.32.1 | SDK/client/server stdio、真实 Codex 调用通过；Cursor 真实调用及健康内容核对已通过 |
| 飞书 SDK | @larksuiteoapi/node-sdk 1.75.0 | 已绑定用户真实单聊收发通过，code=0 且用户确认收到回复；最小权限清单/负向场景另验 |
| schema | zod 4.6.7 | Native health 请求 shape/未知字段/方法限制已接入 |
| Codex | 0.162.0-alpha.17.2（ChatGPT 应用附带） | 登录、两轮、中断、真实 MCP 调用通过；当前个人试点固定 alpha 版本；额外命令审批等待/decline 已真实通过，稳定发行另验 |
| Cursor CLI | 2026.05.28-a70ca7c | 已登录、仅信任 S0 临时目录；精确健康工具白名单下真实调用与结果核对通过 |
| SQLite 驱动 | better-sqlite3 13.0.3 / SQLite 3.53.4 | 固定 Node 24.14.1 + macOS arm64 预编译模块加载、持久化、去重、回滚及换路径打包通过；干净用户环境待验 |
| Keychain | macOS Security.framework，Swift 临时探针 | 独立随机测试项写/读/删通过；未读取现有凭据；正式 SecretStore 尚未实现 |
| Native Host | com.luban.s0_probe | 用户级已注册、仅健康检查；Chrome 端人工连接待验 |

本轮先验证内置 SQLite 作为对照，随后按用户授权下载安装固定版本 better-sqlite3 13.0.3（ignore-scripts）。包内预编译模块可直接加载，无需运行安装脚本或本机编译。现选用 better-sqlite3；node:sqlite 仅保留对照测试，其 ExperimentalWarning 不属于选定驱动。验证范围仅为本机 macOS arm64 + 固定 Node，干净环境与其他架构未验证。

SDK 本次安装的 advertised protocol 为 `2025-11-25`，不将其视为所有外部客户端的协商结果。

依赖精确版本及传递依赖完整性见 `luban/bridge/package-lock.json`。网络安装只针对独立 Bridge 包，未修改全局 npm registry 或原扩展依赖。安装过程 ignore-scripts，当前包不依赖原生 postinstall。

## 实施预算

| 参数 | 值 | 理由与超限行为 |
|---|---|---|
| Bridge protocolVersion | 1 | 与 MCP/Codex 协议版本独立；不兼容拒绝 |
| Native 单帧 | 512 KiB | 低于 Chrome 出站上限；超限拒绝，不截断 |
| 单版代码 | 256 KiB | 沿用现有代码预算；S0 health 不接收代码 |
| 单任务事件 | 32 KiB | 为处理摘要而非逐 token 原始日志；超限不写入 |
| 任务库逻辑预算 | 64 MiB | S1 引入统计/保护清理，仍超限拒绝新增长；不删除未决状态 |
| 诊断预算 | 16 MiB | 默认脱敏摘要，S1 实施有界清理，不存凭据/完整提示词 |
| 任务/诊断期限 | 30 天 / 7 天 | 用户已确认；保存工具/草稿/上一版不受该历史期限影响 |
| Inbox 去重保留 | 至少 30 天，未决任务关联记录不得过期 | 普通任务清理不得恢复消息执行资格；老事件需结合时间与恢复游标拒绝自动重放 |
| 操作确认有效期 | 10 分钟 | 实施建议；即使未过期，页面/版本/授权变化也失效 |

这些是 S1 实施预算，不代表 S0 已实现任务库、事件库、清理器或 Approval 服务。S0 只用 `mayPruneTask` 验证保护逻辑；真实容量边界和事件拒绝必须在 S1/S5 兑现。

系统凭据：本轮已实现 macOS Security.framework 专用 S0 helper，实际配置 Secret 迁移及读回一致通过，配置仅存 credentialRef；Helper 编译分发、Keychain 拒绝/失效等完整产品行为归 S1。Chrome 已安装 bundle 版本 155.0.8059.82（来源 Info.plist），用户已验证原生通道；不采集配置档显示名称。
