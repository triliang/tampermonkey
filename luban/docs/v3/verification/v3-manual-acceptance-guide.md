# V3 统一手动验收指南

当前执行方式：S2–S5 开发与隔离自动检查完成；用户准备必要前置后，由助手整体真实自动验收。必须用户参与的配置/登录/第二身份/睡眠条件见 [前置分工](./v3-acceptance-preflight.md)。原分阶段列表是用例目录，不再默认要求用户全部手动操作。自动报告中注明的替身测试不能替代真实模型、Chrome DOM、飞书送达或干净用户安装。

## 1. 制品与更新

- 正式扩展目录：`/Users/jinxiong.yang/Code/tampermonkey/luban/dist`，现有 ID `dggjjfgdfgicbbcknbdhbgpmmcebbfhg`。
- 本机包目录：`/Users/jinxiong.yang/Code/tampermonkey/luban/bridge/dist/luban-bridge-macos-arm64`，Bridge 0.5.0，Node 24.14.1、macOS arm64。
- 不卸载扩展或清数据。在 `chrome://extensions` 对正式扩展点重新加载。
- 连接设置先断开 Bridge。关闭使用 Bridge 的扩展页面/MCP 客户端并等待空闲 daemon 退出（默认 60 秒），再打开连接设置重连；应看到 **0.5.0**。若仍是旧版本，停止验收并反馈旧版本信息，请助手核对本机旧 daemon；不要手动终止不明 Node 进程。
- 同路径更新无需重装 Native 注册；换路径才按包内 install-bridge.mjs 先卸载旧路径所属注册，再安装新路径。安装器不覆盖他人/旧注册。

包内 Node、依赖和 Keychain helper 已打包；使用旧包回退前先停止集成。升级增加表，不删除旧工具或草稿；旧包遇到新状态时不应重跑未知任务。回退后先使用原第三方模型，待确认兼容性再启用新集成。

## 2. 本地 Codex 前置

需官方桌面包提供固定版本 CLI `0.162.0-alpha.17.2`，路径 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`，并已登录。连接设置可检查 installed、compatible、restrictionsApplied；都需为 true。

本轮每轮使用专用临时工作目录、只读沙箱和最新基线新建线程；不复用用户其他聊天，不自动批准权限，不复制账号凭据。实际生成耗用 Codex 账号额度。若官方 CLI 更新导致不兼容，应更新验证矩阵后再使用，不绕过版本检查。

## 3. 飞书前置

沿用 S0 自建应用和绑定用户，**本轮未自动启用真实监听或发送消息**。需要将非敏感绑定配置放在：

`~/Library/Application Support/Luban/bridge/feishu.json`

配置含 `appId`、`senderOpenId`、`tenantKey` 及现有 `credentialRef`。Secret 留在 Keychain，正式通道拒绝明文 appSecret。`tenantKey` 是租户标识，不是 App ID；可从应用事件调试记录的 `sender.tenant_key` 获取。不要把 Secret 或 token 发到聊天。

可用包内准备脚本从 S0 私有配置复制**非敏感身份与 Keychain 引用**（不会读取/复制 Secret，不会覆盖现有正式配置、不启动监听）：

```bash
LUBAN_PACKAGE="/Users/jinxiong.yang/Code/tampermonkey/luban/bridge/dist/luban-bridge-macos-arm64"
"$LUBAN_PACKAGE/runtime/node" "$LUBAN_PACKAGE/prepare-feishu-config.mjs" "/Users/jinxiong.yang/Code/tampermonkey/luban/bridge/.local/feishu.json" "你的 tenantKey"
```

若正式配置已存在，先核对而非覆盖。保持文件 0600、本人所有。SDK 仅启用单用户单聊文本；停止 S0 探针与其他监听进程后，再在正式连接设置点“启动飞书监听”。启动状态只表示监听已启动，实际收件/发送以任务记录和平台消息 ID 为证。

## 4. 建议验收顺序

1. 选择无业务风险的临时页面，创建临时工具；保留原数据。复核 [S2 MCP 配置说明](./v3-s2-mcp-setup.md)，然后执行 [S2 清单](./v3-s2-manual-checklist.md)。当前包已升级到 0.5.0；S2 早期 0.2.0 为历史版本。
2. 执行 [S3 本地 Codex 清单](./v3-s3-manual-checklist.md)：生成与两轮修改、切换执行方、停止、断连/导航、运行保存。
3. 执行 [S4 飞书清单](./v3-s4-manual-checklist.md)：缺目标等待、绑定工具、机器人任务、本地拒绝/确认、查询取消、摘要预览发送与平台回执。
4. 执行 [S5 集成清单](./v3-s5-manual-checklist.md)：并发、重启、原功能和真实窄屏/键盘验收，最后清理临时权限。

每条记录“通过 / 失败 / 未执行”，失败时附用例编号、显示的错误、Bridge/CLI 版本及任务编号即可；不要提供密钥。自动项目不用重复手工造故障。S0 干净用户安装、S1 双 Chrome profile 继续保留用户延期状态。

## 5. 交付范围

面向当前 macOS arm64 个人本地试用，整体真实验收待完成。lark-cli、Cursor 作为会话执行方、开机常驻、多平台、公开发布不在本轮范围。MCP/飞书不允许直接保存、恢复、删除、开启自动运行或执行任意 JS；网页写入仍须鲁班本地确认。


2026-10-17 真实自动验收更新：已按限定授权执行 Codex/Cursor、飞书和原模型真实联调，修复两项生命周期问题，最终 Bridge 62 项自动回归通过。当前因 Mac 锁屏暂停，尚未宣称最终清理或所有真实用例通过；结果、待验和恢复位置见 [整体真实验收记录](./v3-real-acceptance-2026-10-17.md)。

## 最新收尾状态

Mac已解锁，运行中撤权和新任务恢复复测通过；临时客户端、页面授权、测试工具及凭据已清理，监听和本机测试服务已停。仅浏览器127.0.0.1网站权限因安全策略阻止自动清理，需用户从扩展详情移除。S5-M05 Esc关闭未通过，窄栏/完整键盘链待验；其他条件/延期项见 [最终真实记录](./v3-real-acceptance-2026-10-17.md#解锁后的最终收尾结果)。

## 最新键盘与制品复验

Esc与长哈希溢出已修复，源码及Chrome隔离组件验证通过，扩展382项全量通过；正式扩展重新加载后复测仍待完成，S5-M05尚不勾整项通过。制品对应关系已核对。需用户重新加载正式扩展并移除127.0.0.1主机权限（浏览器策略阻止自动操作），详见 [键盘与制品补充验收](./v3-keyboard-artifact-verification-2026-10-17.md)。其余条件/延期项不变。

最终更新：用户已确认正式扩展重新加载及本次127.0.0.1主机权限移除；正式跨页面代码Esc和焦点恢复复测通过，S5-M07清理完成。实际Chrome侧栏拖窄仍未自动验证；其余第二身份、浏览器重启、物理休眠及已延期项保持。见 [正式复测记录](./v3-keyboard-artifact-verification-2026-10-17.md#正式扩展重新加载后的复测)。
