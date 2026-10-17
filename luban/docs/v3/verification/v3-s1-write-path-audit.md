# S1 写路径审计

日期：2026-10-17。范围为正式扩展的可达消息路由及 Bridge 的 Native/外部客户端网关。S2 MCP 工具、S3 Agent Adapter、S4 飞书任务入口不在本轮已交付范围。

| 路径 | 来源与授权 | 写入/执行门禁 | 证据 |
|---|---|---|---|
| 原模型生成/编辑 | 扩展侧栏/设置页，禁止 Content Script 伪造 | 持久 workspace owner、租约、epoch、draftRevision CAS；取消后迟到结果拒绝 | workspace-generation、workspace-lock、worker-recovery 测试；原人工 M15 |
| 外部提交候选 | 独立 client token 绑定 profile；本地明确授予 `draft.submit` | 文档授权、质量检查、版本校验和同事务 grant/owner 检查；仅更新候选，冲突副本可查看 | external-dispatcher/coordinator 测试；真实 Chrome 候选及旧 revision 冲突 |
| 外部申请/确认试运行 | 外部只能申请；决定仅接受受信扩展 UI | Node 与 IDB 一次消费；绑定 profile、client、workspace、codeHash、document、navigationEpoch、worker/session；执行前后复核任务有效性 | 独立 IPC 拒绝外部 confirm；真实拒绝、确认、回执和重复申请 |
| 原手动试运行 | 扩展 UI 明确请求 | 相同 VersionService 质量检查、owner/CAS、操作编号、指定文档执行、持久回执；未知结果不能自动重跑 | version-service、trial-runner、worker-recovery 测试 |
| 运行保存版 | 扩展 UI 明确请求，不接受前端任意代码 | SavedRunner 的脚本租约及持久操作记录；核对保存版本及相关 workspace；GM 与终态事务提交；未知操作阻止后续运行 | saved-runner 测试，包含互斥、重复操作及未知恢复；原无记录直接注入分支已移除 |
| 保存/恢复/重命名/删除 | 扩展 UI；外部网关无直接保存/删除方法 | receipt/hash/版本/owner 检查；保存版执行锁；自动运行注册协调；删除前检查关联工作区租约 | version-service、saved-runner、auto-runtime 测试 |
| 既有自动运行及 GM | 原 P4 用户授权的准确 host；校验扩展 sender、顶层 frame、tab/document | 已注册 version/hash/generation 与平台权限；GM grant/单调 seq/lease；工作区任务或保存版执行期间拒绝启动及迟到 GM 写入，未知操作需先核对 | auto-runtime/auto-origin/auto-source 测试；不将该路径伪装成新的外部 Task Coordinator |
| 清理及诊断 | 本地连接设置；外部客户端不能调用 | 30 天任务/7 天诊断；保护未知、活跃及未送达记录；物理 SQLite/WAL 预算；诊断严格固定元数据 schema | maintenance/diagnostic-store 测试；真实 Chrome 导出 JSON 严格验证 |

`INJECT_SCRIPT` 和 `SAVE_SCRIPT` 的任意代码/旧直接保存消息已拒绝。原自动运行的长期授权继续使用 P4 网关；本轮没有为 MCP/飞书增加绕过确认、直接保存或直接执行的接口。

恢复语义：已完成结果丢失只补交结果，不再次执行。网页效果已出现但有效回执缺失时记录 unknown；本地核对仅归档为中断，不认定成功。真实 Chrome 用一次 DOM 标记后等待超时验证了该分支，重连和核对后标记数量均保持 1。另有事务故障注入验证执行后持久化失败的保护。

M03 双真实 Chrome 配置档按用户决定延期。Unix IPC 两 profile 隔离测试通过，但不把它记成真实双 Chrome 配置档已验收；正式发布前仍需补该环境验证。
