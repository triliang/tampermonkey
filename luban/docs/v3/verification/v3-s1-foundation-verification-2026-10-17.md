# S1 基础闭环验收（2026-10-17）

结论：**S1 在当前 macOS arm64 个人试点范围验收通过，带 M03 延期项进入后续开发。** 双真实 Chrome 配置档未执行，不计通过，正式发布前仍需补验；S0 干净用户环境继续遵循用户的暂缓决定。S2–S5 尚未完成。

## 本轮交付

- 外部客户端独立凭据、五分钟一次性配对码、当前 profile 绑定及撤销。外部网关不能调用本地确认或管理方法。
- Native → Bridge Coordinator → 扩展 Dispatcher 的配置档/文档路由、请求键去重、租约与 epoch、取消、冲突候选保留、断连恢复。
- 默认只读 PageGrant；提交候选及申请试运行需额外明确授权。确认卡展示来源、client/profile、页面、草稿版本、代码摘要及代码。
- 确认一次消费，绑定版本/文档/授权/会话；丢失完成回执只补结果，未知结果仅核对归档。外部更新同步侧栏，未提交输入不被覆盖，试运行成功仍需用户检查效果后保存。
- 保存版执行纳入持久操作记录和脚本锁；版本写入、删除和既有自动运行加入互斥保护。完整边界见 [写路径审计](./v3-s1-write-path-audit.md)。
- SQLite 任务物理预算 64 MiB（含 WAL/SHM），诊断预算 16 MiB；任务 30 天、诊断 7 天；保护活跃、未知及未送达记录，维护时检查点与压缩。
- 设置页提供客户端管理、未知外部任务核对、维护和诊断导出。诊断仅含固定事件元数据和存储统计。

## 自动验证

证据目录：[2026-10-17-foundation](./evidence/s1/2026-10-17-foundation/)。

| 验证 | 结果 | 说明 |
|---|---|---|
| 扩展测试 | 49 文件、371 项通过 | 迁移、owner/CAS、外部调度、取消、确认、保存版与原功能 |
| Bridge 测试 | 35 项通过 | 真实临时 Unix socket、认证/profile 隔离、确认、撤销、SQLite/协议 |
| TypeScript / ESLint | 通过 | 最终源码 |
| Vite 构建 | 通过 | `luban/dist/` |
| 安装包迁移 smoke | 通过 | 包内 Node、含空格新路径、无全局 Node、IPC；临时注册替身 |
| 正式启动器 health | 通过 | 既有正式 ID/注册路径，返回任务/维护能力；与真实 Chrome 联调分开记录 |
| 正式任务库重启 | 通过 | 三条已结束验收任务及事件序列保持；执行中恢复另有故障测试 |

初次高并发全量测试有一项原有 SSE 性能用例超出 50ms。失败记录保留于 `extension-tests-initial.txt`；降低至两个 worker 完整复验通过，未修改用例或阈值。沙箱内 Unix socket 曾返回 EPERM，获准在隔离临时目录重跑通过。

## 真实 Chrome 联调

正式扩展 `dggjjfgdfgicbbcknbdhbgpmmcebbfhg`，原配对 profile 保持。用户明确授权临时客户端/测试页，以及为正式鲁班开启 Chrome 的 Allow User Scripts。该开关原为 off，首次确认明确未执行；修正分类后，缺少该能力记 failed，不能误记 unknown。

1. 临时客户端配对后页面为空。明确只读授权后，仅返回唯一测试页；试运行申请被 `PAGE_CAPABILITY_DENIED` 拒绝。
2. 额外授予候选/申请能力后，真实候选完成 CAS，侧栏自动更新到草稿版本 2，未执行、未保存。旧 revision 候选被 `REVISION_CONFLICT` 拒绝，当前草稿不变，冲突可查看。
3. 真实申请被拒绝：任务 cancelled、approvalState rejected，页面无测试标记。
4. 新申请经本地确认：任务 completed，签发绑定工作区/版本的 receipt，页面 `LUBAN_S1_EFFECT_ONCE` 恰好一个。重复相同申请返回原 task/receipt，标记数量不增加，确认卡消失。
5. 回执缺失场景：新版本添加唯一标记后等待，触发现有 10 秒超时。任务 waitingUser/unknown，无成功 receipt；断开/重连后保持未知，标记为 1；本地核对后 cancelled/reviewed，标记仍为 1。时间窗口内断连的尝试曾正常完成，不计故障注入成功；本项采用真实超时故障证据。
6. Chrome 实际下载诊断 JSON，并逐字段验证固定 schema：无凭据、页面正文、代码或对话。
7. 两个临时客户端均已撤销，旧凭据实际被拒绝；页面授权 0，测试页关闭以终止等待脚本，本机临时凭据及请求文件已删除。未保存或修改用户工具。临时未保存测试草稿/任务按正常保留机制留存。

对应证据：`chrome-live-results.json`、`chrome-timeout-task.json`、`diagnostic-export-check.json`。初次权限阻塞保留在 `chrome-live-initial-permission-block.json`，不是当前卡点。

## 阶段出口

S1-A1/A3/A4/A5/A6/A7/A8/A9/A10 由自动证据、既有人工反馈和上述真实 Chrome 联调组合覆盖。S1-A2 的真实双 Chrome 配置档按用户明确决定延期，Unix IPC 双 profile 测试不能替代该环境验收。

当前没有需要用户补充账号、密钥或再次授权的 S1 卡点。人工清单中 M06/M07 的额外窗口操作保留为可选复核，不声称已经人工执行。S2 的正式 MCP 工具和真实 Codex/Cursor 接入仍需按下一阶段实施；`bridge/scripts/s1-client.mjs` 只是本地验收客户端。
