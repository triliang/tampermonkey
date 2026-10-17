# S1 执行记录

日期：2026-10-17。状态：S1 在当前 macOS arm64 个人试点范围验收通过，带 M03 用户延期项进入后续开发。外部调度、确认卡、写路径保护与物理维护已实现，真实 Chrome 确认/未知恢复/撤销/诊断导出通过；S2–S5 尚未完成。

## 交付入口

- 正式扩展：`luban/dist/`，在原目录重新加载，保留已有数据；不要卸载重装。
- 正式扩展 ID：`dggjjfgdfgicbbcknbdhbgpmmcebbfhg`，用户已提供。
- macOS arm64 包：`luban/bridge/dist/luban-bridge-macos-arm64/`，内置 Node v24.14.1。
- Native Host：`com.luban.bridge`，已注册到当前用户 Chrome；只允许上述正式扩展 ID，不覆盖 `com.luban.s0_probe`。
- 设置 → 连接与集成：连接、健康检查、断开、撤销配对、未授权页面边界检查、页面授权列表、任务记录与未知操作核对。
- 网页侧栏 → 快捷设置：明确授权当前文档摘要。M01 首次连接验收前不要先授权网页。

## 实现及 C4 对接映射

| 边界/组件 | 当前实现 | 说明 |
|---|---|---|
| 扩展 UI → SW | `Integrations.tsx`、`bridge-connection.ts`、`index.ts` | 配对仅允许设置页；页面授权仅从网页侧栏发起；不接受内容脚本伪造 |
| SW → Native Host | `bridge-protocol.ts`、`protocol-contract.json`、`bridge-host.mjs` | 共享协议版本/方法；Native 长度帧与其他 stdio 协议分离 |
| Native → Bridge | `local-daemon.mjs` | 用户私有 Unix socket、启动串行锁、认证握手、单实例；无 HTTP 监听；空闲 60 秒退出 |
| Chrome profile 身份 | `profile-store.mjs`、`native-gateway.mjs` | 随机凭据、哈希存储、扩展身份绑定、每次访问检查撤销；自报名称不能认证 |
| 页面授权 | `page-grants.ts`、`page-capture.ts` | profile/browserSession/documentId/navigationEpoch；指定文档读取；导航/关页/权限撤销/断连/Worker 或浏览器重启失效 |
| Bridge 页面路由元信息 | `profile_pages` | 只同步明确授权的页面；查询不返回浏览器内部路由身份；断连/重启清空 |
| 扩展草稿与任务 | IDB v2、`workspace-lock.ts`、`task-journal.ts` | 原数据保留；租约、续租、单调 epoch、事务内 owner/CAS、任务事件与取消状态 |
| 试运行副作用 | `version-service.ts`、`trial-operation.ts`、`trial-runner.ts` | 确认编号一次消费，执行前日志与回执事务；中断/超时未知且不自动重跑；人工核对不声明上次成功 |
| Bridge 外部任务基础仓库 | `task-store.mjs`、`approval-store.mjs` | SQLite 任务/事件/租约/容量与绑定确认基础已测；外部入口统一调度尚待接入 |

第三方模型的本地任务记录保存在扩展 IDB，Bridge 未安装时仍可使用。Bridge SQLite 外部任务仓库尚未接入 MCP/Agent/飞书，不将两个仓库描述为已实现跨进程统一任务调度。

## 验证结果

- 扩展：46 个测试文件、354 项测试通过。
- Bridge：22 项测试通过，含真实临时 Unix socket 单实例/多配置档会话测试。
- TypeScript 类型检查、ESLint、构建和 JS 语法检查通过。
- 正式包搬迁至含空格临时路径，仅使用包内 Node、无可用全局 Node/PATH：Native 帧 → Unix IPC → 配对 → 空授权页 → 读取拒绝 → 撤销通过。
- 已注册正式 Host 的只读健康检查通过：Node v24.14.1、darwin/arm64、无默认页面能力。此项是命令行启动验证，不替代真实 Chrome 配对反馈。
- IDB v1 → v2 保留全部旧存储记录；阻塞后可重试；不通过清库修复。
- 持久租约拒绝并发写入和旧 epoch；释放旧任务不能释放替代任务的租约。
- 网页采集途中撤销授权不返回结果；指定文档采集不查询活动页。
- 故障注入执行后写入失败：操作保持 unknown，新试运行被阻止；人工核对只解除阻塞，执行次数不增加。
- 原 UI 用例发现生成产物出现早于持久收尾的问题，测试改为等待按钮可用再点击；没有放宽功能断言。

证据目录：`verification/evidence/s1/`。S0 证据保持原快照，不以 S1 源码重写。

## 当前阶段出口

1. 原人工项按用户反馈通过；M03 双真实 Chrome profile 延期，不计已验。
2. 独立客户端、真实 IPC、Task Coordinator → 扩展 owner/CAS 已闭环；真实候选、冲突、拒绝、确认、完成回执及重复去重通过。
3. 用户批准并开启 Chrome 用户脚本能力；首次权限阻塞已解除。真实 DOM 后超时故障进入 unknown，重连无重放，核对仅归档，页面标记为 1。
4. 任务/诊断保留及物理预算维护自动通过，真实 Chrome 诊断 JSON 严格验证通过。
5. 写路径审计完成：保存版运行纳入操作记录及脚本锁，删除/版本/自动运行加入互斥保护，原 P4 授权及注册恢复机制保留。
6. 临时客户端/页面授权撤销，旧凭据拒绝，凭据文件删除，测试页关闭；未保存或修改用户工具。当前无 S1 账号/密钥/授权卡点。

当前完整结论见 [基础闭环验收](./v3-s1-foundation-verification-2026-10-17.md) 与 [写路径审计](./v3-s1-write-path-audit.md)。下方历史轮次保留，不能将旧 API Key/权限阻塞当作当前状态。

## 人工验收反馈

2026-10-17：用户反馈“M01 通过”。对应正式扩展 ID `dggjjfgdfgicbbcknbdhbgpmmcebbfhg`；记录首次连接及无默认页面权限的人工验收通过，不扩展为撤销、重连、多配置档或 S1 整体通过。

## 2026-10-17 自动验收补充

扩展 47 个文件、356 项测试和 Bridge 24 项测试通过，类型检查及 ESLint 通过。本轮补齐升级事务中止回滚、Worker 恢复、Bridge 重启及强制终止测试进程后的恢复证据。真实 Chrome 重连身份保持、刷新/关页后页面授权清空均通过；完整 M04 任务恢复仍待有历史任务后验证。原模型真实回归被界面“API Key 无效”阻塞，需要用户配置可用模型凭据。

剩余人工操作、开发缺口与精简浏览器证据见 [本轮验收报告](./v3-s1-auto-verification-2026-10-17.md)。本轮未改变产品运行代码，未重构建扩展或更换正式配对凭据。

## 最新人工验收结论（2026-10-17）

用户明确反馈“M03：两个 Chrome 配置档隔离先不验证，延期。其他验证通过”。按此前交付的步骤，记录正式配对撤销/重配对、任务记录断开重连、旧数据保留、原模型停止与生成/试运行/保存/恢复、完整 Chrome 重启授权失效通过。此前 API Key 卡点不再列为当前待处理项；未读取或记录用户密钥。

M03 未执行，不计通过，不据此声明双真实 Chrome profile 支持已完成。该反馈不替代外部调度、外部确认卡、写路径审计和物理存储维护等开发项，也不将 S1 整体标为完成。历史记录保留，当前结论以本节为准。

## 本轮实现及真实 Chrome 联调补充

新增独立客户端配对/撤销、配置档任务路由、候选冲突保留、试运行确认卡、物理维护及诊断导出，已构建扩展和更新正式 Bridge 包。真实浏览器发现两处反馈问题后补测修正：拒绝任务的公开结果同步为 rejected；明确缺少 userScripts 能力属于 failed，不能误记为 unknown。临时联调已清理，没有遗留客户端或页面访问权限。

历史测试数及 API Key 卡点只代表之前轮次；当前以基础闭环报告与最新证据为准。

## 最终补充结论

本轮真实确认执行、缺失回执后的未知恢复、断开重连和人工核对全部通过。Chrome 用户脚本开关已经用户单独授权开启，不再是卡点。自动测试扩展 371 项、Bridge 35 项通过，类型、静态检查及构建通过。S1 个人试点带 M03 延期项准出；发布前仍需补双真实 Chrome profile 验证。
