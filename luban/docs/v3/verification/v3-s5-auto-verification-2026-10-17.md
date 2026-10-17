# S5 集成自动验收与交付记录

日期：2026-10-17。版本：Bridge 0.5.0，macOS arm64 / 内置 Node 24.14.1。**交付为待统一手动验收版本；不能把自动检查通过写成 V3 全部真实验收完成。**

原S5快照复验：**扩展50文件/380项、Bridge56项全部通过**。后续真实联调修复Bridge全量为62项；最新UI修订扩展为51文件/382项（均0失败、0跳过），来源不同批次、不相加。最新结论与范围见 [键盘与制品补充验收](./v3-keyboard-artifact-verification-2026-10-17.md)。 类型检查、lint、语法、构建、包内搬迁冒烟与源码一致性通过。

## 最终自动检查

最终测试数量、零失败/零跳过与命令结果以 `evidence/s5/2026-10-17/summary.json` 为准；原始日志与源文件/制品 SHA-256 在同目录归档。若检查失败，本报告不得作为通过证明。

| 项目 | 自动范围 | 证据 |
|---|---|---|
| 扩展全量回归 | 原模型、工作区、迁移、owner/CAS、外部授权/确认、AgentTransport、侧栏服务交互 | extension-tests.txt |
| Bridge 全量回归 | IPC/Native、SDK stdio、任务恢复、Agent 子进程/任务、飞书 Inbox/Outbox、三入口租约竞争 | bridge-tests.txt |
| 类型、lint、JS 语法、生产构建 | 源码静态检查与扩展 dist | typecheck.txt、lint.txt、bridge-syntax.txt、build.txt |
| 本机包 | 固定 Node/依赖、Keychain helper、MCP/enrollment、正式 Native Host、手动指南及配置准备工具 | package-build.json、package-smoke.json |
| 制品一致性与隐私 | 包内 Bridge src 对应当前源码；扩展 dist/运行时/入口摘要；包内无本机配置/SQLite/凭据 | source-hashes.json、artifact-hashes.json、summary.json |

## 阶段标准对应

| 用例 | 自动结论范围 | 必须手动补验 |
|---|---|---|
| S5-A1 | 三入口共用租约；竞争延后、撤销阻止 live、IDB CAS 防覆盖通过 | 三个真实入口并发；双 profile 仍按用户延期 |
| S5-A2 | 崩溃/重启、旧 epoch、cancelRequested、unknown 不重放通过 | 实际浏览器/系统休眠与官方进程时序 |
| S5-A3 | IDB 加性迁移、失败/阻塞、SQLite 物理容量/保留、未决保护回归通过 | 原用户数据升级后的目视核对 |
| S5-A4 | 含空格路径搬迁、无全局 Node PATH、包内 Native/MCP 启动通过 | 干净用户安装仍延期；真实更新/回退按指南 |
| S5-A5 | 侧栏服务交互与生产构建通过 | 窄屏、键盘、焦点与真实 Chrome 视觉未执行 |
| S5-A6 | 原链路全量回归通过，未删除原模型配置 | 原模型真实生成/运行/保存/恢复/自动运行/导出 |
| S5-A7 | 各阶段覆盖/剩余项已列；lark-cli 等 P1 未开放 | S2/S3/S4 的真实业务全部待用户勾选 |
| S5-A8 | 最终源码及包入口摘要归档 | Chrome 实际加载的 Bridge 0.5.0、正式扩展 ID 核对 |

检查过程中发现旧侧栏 UI 测试在保存记录写入后、按钮恢复可用前点击，存在异步竞态；已补等待实际可交互状态，再复跑全量，不放宽产品检查。官方 CLI 限制参数核对结果独立记录于 S3，不以替身替代真实版本检测。

## 交付入口

- 扩展：`luban/dist/`；Bridge：`luban/bridge/dist/luban-bridge-macos-arm64/`。
- [统一手动验收指南](./v3-manual-acceptance-guide.md)。各阶段：[S2](./v3-s2-manual-checklist.md)、[S3](./v3-s3-manual-checklist.md)、[S4](./v3-s4-manual-checklist.md)、[S5](./v3-s5-manual-checklist.md)。
- 已有 S0/S1 延期项保持，不新增全局信任，不自动改 MCP 配置，不启动真实飞书监听或发消息，不进行发布/开机常驻。
- 官方 CLI 路径与固定版本、正式飞书配置/tenantKey、真实平台权限需按指南核对；尚未观察真实模型或消息送达，不能宣称双 MCP 客户端或三入口完整支持已验收。

后续真实Codex/Cursor/飞书/原模型链路已按整体验收记录执行，本文原表格的“尚未执行”为旧快照状态；当前剩余项以上述最新报告及整体验收记录为准。

最终更新：用户已确认正式扩展重新加载及本次127.0.0.1主机权限移除；正式跨页面代码Esc和焦点恢复复测通过，S5-M07清理完成。实际Chrome侧栏拖窄仍未自动验证；其余第二身份、浏览器重启、物理休眠及已延期项保持。见 [正式复测记录](./v3-keyboard-artifact-verification-2026-10-17.md#正式扩展重新加载后的复测)。
