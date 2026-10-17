# S0 人工验收清单

日期：2026-10-16。状态：待人工执行。本清单只覆盖 S0；验证探针不具备网页访问、生成工具或执行页面操作的能力。

依据：[执行计划 S0](../v3-execution-plan.md)、[S0 执行记录](./v3-s0-record.md)。逐项填写通过/失败/阻塞、实际结果、环境版本及截图/脱敏日志；不要将账号、App Secret、Token 写入验收材料。

## 1. 当前已准备的材料

| 材料 | 位置 |
|---|---|
| 内置 Node 的 macOS arm64 验证包 | `luban/bridge/dist/luban-s0-macos-arm64/` |
| 健康检查扩展 | 包内 `probe-extension/` |
| 未授权来源对照扩展 | 包内 `probe-extension-denied/` |
| 已注册的 Chrome Native Host | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.luban.s0_probe.json` |
| Host 名称 / 唯一允许的扩展 ID | `com.luban.s0_probe` / `llgpaikkfllijemnfpgfnhdpmcofeadi` |
| Codex 官方可执行文件（本机已验证登录） | `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` |
| Cursor CLI | `~/.local/bin/cursor-agent`；桌面已登录不代表此 CLI 已登录 |
| 飞书专用配置 | `luban/bridge/.local/feishu.json`，已填用户提供的 App ID，Secret 和 senderOpenId 尚空，权限 0600，已 Git 忽略 |

工作区根路径：`/Users/jinxiong.yang/Code/tampermonkey`。包是 S0 试验产物，不是 V3 正式扩展；不要替换当前正常使用的鲁班扩展。Native Host 注册仅允许健康检查扩展，不开放页面权限。

## 2. Chrome Native Messaging（S0-A2）

- [x] M01 在 Chrome 的 `chrome://extensions` 打开开发者模式，加载已解压扩展，选择 `luban/bridge/dist/luban-s0-macos-arm64/probe-extension/`。记录 Chrome 版本、配置档及实际扩展 ID。 用户于 2026-10-16 反馈实际 ID：`llgpaikkfllijemnfpgfnhdpmcofeadi`，与预期一致；Chrome 版本和配置档仍待补充。
- [x] M02 检查 ID 与 `llgpaikkfllijemnfpgfnhdpmcofeadi` 一致。打开扩展弹窗，点击“连接并检查”。期望 `ok: true`、`node: v24.14.1`、`arch: arm64`、`pageCapabilities: []`。 用户于 2026-10-16 提供真实返回：`ok: true`，service=`luban-s0-native-probe`，node=`v24.14.1`，platform=`darwin`，arch=`arm64`，pageCapabilities=`[]`，判定通过。
- [x] M03 点击“断开”，再点击“连接并检查”。期望明确显示断开/重连状态，并再次获得健康结果；没有网页内容被读取。 用户于 2026-10-16 反馈“重连成功”，重连结果已确认；此结论依据用户反馈。
- [x] M04 加载包内 `probe-extension-denied/`，其 ID 应与允许 ID 不同。点击检查，期望 Chrome 拒绝访问 Host，不能得到 `ok: true`。不能为通过此项而把第二个 ID 加入 allowlist。 用户于 2026-10-16 提供实际提示：`Access to the specified native messaging host is forbidden.`，符合预期，判定通过。
- [x] M05 完全退出再启动 Chrome，重新点击验证扩展检查。期望能够重新启动 Host；没有自动执行积压网页操作。用户于 2026-10-16 反馈“重启后连接成功”，重启连接验证通过；探针只开放 health，不具备网页操作能力。

反馈建议：发送 M01–M05 的结论及 M02/M04 截图即可，不需要发送浏览器其他标签内容。

## 3. 打包、迁移与卸载（S0-A1）

2026-10-16 用户明确要求因验证成本较高，先忽略干净用户环境验证。M06 及 M07–M10 中依赖该环境的部分本轮暂缓，不记为通过，也不阻塞个人本地试用的后续开发；公开发布前重新安排。已完成的同用户换路径安装/连接结果继续有效。

自动测试已经验证“复制到含空格新路径 + PATH 不可用”仍能执行内置 Node。以下干净环境步骤尚待人工：

- [ ] M06 将整个包复制到不含项目源码/开发依赖的 macOS arm64 用户环境；记录系统版本。无需安装全局 Node/npm。
- [ ] M07 在新位置打开终端，使用包内 Node 安装注册（先确认没有同名旧注册；安装器不会覆盖旧注册）：

```bash
cd "/你的新路径/luban-s0-macos-arm64"
./runtime/node ./install-probe.mjs install "$PWD"
```

- [ ] M08 在新环境加载包内健康检查扩展，执行 M02/M03，验证安装器使用新绝对路径；不能仍指向开发机源码路径。
- [ ] M09 使用包内 Node 卸载本包注册：

```bash
./runtime/node ./install-probe.mjs uninstall "$PWD"
```

期望只删除属于这个包的 `com.luban.s0_probe` 注册；其他 Native Host、鲁班工具和用户数据不变。再次连接应提示找不到 Host。

- [ ] M10 如需继续验证，使用 install 恢复注册，检查成功；在 Chrome 手动移除未授权对照扩展。不要删除当前使用中的鲁班。

2026-10-16 同用户换路径验证：已复制到 `~/code/tmp/luban-s0-macos-arm64`，通过旧包卸载器移除原注册，再注册新包；用户反馈断开后重新连接返回 `ok: true`。此项证明新绝对路径下安装/启动成功，不勾选 M06–M10 的干净用户环境项目。当前有效注册指向新包，后续卸载应从新包执行。

当前新路径对应命令：

```bash
cd /Users/jinxiong.yang/code/tmp/luban-s0-macos-arm64
./runtime/node ./install-probe.mjs uninstall "$PWD"
# 需要恢复时再执行：
./runtime/node ./install-probe.mjs install "$PWD"
```

## 4. Codex 与 MCP（S0-A4/A5）

已有自动/真实证据：Codex 登录、同线程两轮完成、第三轮中断；Codex CLI 已实际调用 `luban_probe_health`；SDK 客户端也已调用通过。

- [x] M11 核对上述结果和实际 Codex 版本。当前是应用附带的 `0.162.0-alpha.17.2`，不代表已冻结稳定生产版本；本轮个人试点固定使用已测版本；公开发布前另验稳定版本，不宣称 alpha 为稳定生产版本。
- [x] M12 验证真实额外权限等待/拒绝：仅在隔离测试目录产生需要审批的无副作用请求，检查没有自动批准、状态能区分等待与拒绝。2026-10-16 真实探针收到 requestApproval，先等待再明确 decline；marker 未创建，验收通过。
- [x] M13 在本机终端完成 Cursor CLI 登录（若 CLI 已登录可跳过）：

```bash
/Users/jinxiong.yang/.local/bin/cursor-agent login
```

用户于 2026-10-16 确认 Cursor CLI 已登录，真实请求不再返回认证错误。登录页面及账号授权由用户操作；不要将登录 Token 发给助手。已按用户授权批准独立 S0 配置下的 `luban_s0`，未启用“自动批准所有 MCP”。

- [x] M14 登录后告知助手继续执行 Cursor 探针，或运行：

```bash
cd /Users/jinxiong.yang/Code/tampermonkey/luban/bridge
LUBAN_CLIENT_BIN=/Users/jinxiong.yang/.local/bin/cursor-agent \
./dist/luban-s0-macos-arm64/runtime/node ./scripts/probe-clients.mjs cursor --call --trust-probe
```

期望输出 `client: cursor`、`called: true`。2026-10-16 已执行通过，工具完成事件与健康内容核对结果 `healthVerified: true`；用户已明确授权仅信任独立临时验证目录。仅工具发现或模型口头说“调用成功”不算通过；若工作区信任/权限被阻止，先记录具体原因，不开启全局 bypass 或自动批准所有工具。

## 5. 飞书收发（S0-A6）

应用 ID 已知；其他条件尚未验证。先在开发者后台检查：

- [x] M15 应用开通机器人、选择长连接接收事件、订阅 `im.message.receive_v1`，有单聊接收和机器人身份发送所需最小权限；应用版本对绑定用户可见。用户已确认单机监听、必要权限；实际单聊收发已通过。依据是用户确认和功能证据，未通过后台 API 审计全部 scope，不截图 Secret。
- [x] M16 确认同一应用没有另一台 Bridge/程序争抢事件；用户已确认单机监听；不要求停用与本次无关的飞书应用。
首次获取 senderOpenId 可以先只填 appSecret，再启动接收型绑定探针：

```bash
cd /Users/jinxiong.yang/Code/tampermonkey/luban/bridge
./dist/luban-s0-macos-arm64/runtime/node ./scripts/pair-feishu.mjs .local/feishu.json
```

用自己的账号单聊机器人，准确发送终端生成的一次性 `LUBAN_BIND_…`。探针有效期 5 分钟，只接受用户私聊的精确验证码；识别到后立即停止，结果写入已忽略的 `.local/feishu-pairing-candidate.json`。它不发送消息、不执行网页、不自动覆盖配置。确认候选是本人后，再将 senderOpenId 写入配置，继续 M18–M20；超时需重新生成验证码。

- [x] M17 在本机专用配置 `luban/bridge/.local/feishu.json` 中填写 `appSecret` 和该应用下绑定用户的 `senderOpenId`。可从该应用的事件调试记录中取得 `sender.sender_id.open_id`。不从另一应用复用 open_id，不提交 Git，不发到聊天。用户已确认验证码候选并授权写入绑定 ID，配置已保存为 0600；未将 Secret 输出或归档。此文件是 S0 临时凭据输入，验证后清除 Secret；正式 Bridge 必须使用系统凭据库。
- [x] M18 确认文件保持 0600 权限，然后启动最长 5 分钟探针：

```bash
cd /Users/jinxiong.yang/Code/tampermonkey/luban/bridge
chmod 600 .local/feishu.json
./dist/luban-s0-macos-arm64/runtime/node ./scripts/probe-feishu.mjs .local/feishu.json
```

- [x] M19 在 5 分钟内以绑定用户与机器人单聊，准确发送 `LUBAN_S0_PING`。期望收到 `LUBAN_S0_OK · 仅验证收发，不执行网页任务`，终端输出 `eventReceived: true`、`status: platform-accepted` 及平台 messageId。2026-10-16 实际事件全部匹配，发送 code=0、platform-accepted，用户反馈已收到预期回复；[证据](./evidence/s0/feishu-roundtrip.json)。
- [x] M20 非绑定用户/群聊/普通文本不产生测试回复；无网页访问/执行。2026-10-16 实际收到本人普通文本，commandMatched=false、replyAttempted=false，真实普通文本忽略通过。群聊/未绑定用户由自动过滤测试覆盖，真实多身份测试归 S4，不声称已实测；首次成功后探针停止。
- [x] M21 验证完成后清除临时配置的 Secret，核查输出/证据无凭据；反馈只提供通过/失败与脱敏错误摘要。2026-10-16 已迁入 macOS Keychain，读回一致后原子移除配置中的 appSecret，仅保留 credentialRef；探针可由 Keychain 加载，无明文回退。正式 S1 仍需完成安装分发与故障恢复。

## 6. 存储、参数与阶段结论（S0-A3/A7）

- [x] M22 核对自动 SQLite 持久化/唯一约束/事务回滚结果，以及 Keychain 临时测试写入/读取/删除成功记录；已复核通过；实际飞书 Secret 仅在用户指定应用范围内迁移，未读取无关凭据。
- [x] M23 核对选定驱动 `better-sqlite3 13.0.3` 及 SQLite 3.53.4 的本机测试结果；干净环境部分已按用户要求暂缓；同用户新路径包已自动执行通过。可使用包内 Node 运行 `./runtime/node ./src/sqlite-probe.mjs`，期望 persistence/uniqueness/rollback 均为 true。脚本仅创建并删除自己的临时数据库。内置 node:sqlite 仅作对照测试，不是正式选型。
- [x] M24 核对 [依赖与参数表](./v3-s0-dependencies.md)：30 天任务、7 天诊断；未决/活动/发送未知任务保护；容量与超限拒绝规则。参数已复核并作为 S1 实施预算冻结；不是性能实测指标。
- [x] M25 对照 S0-A1–A7 汇总结论。未完成必选验收或依赖冻结时，保持 S0“执行中/待验收”；干净环境验证已由用户决定本轮暂缓，不阻塞个人试用后续开发，但不得写成通过或宣布该环境兼容。

| 项目 | 结果 | 环境/证据/问题 |
|---|---|---|
| M01–M05 Chrome | 连接相关验证通过 | 用户已确认 ID、首次连接、重连、未授权拒绝与重启连接；Chrome 版本/配置档待补 |
| M06–M10 干净环境安装 | 用户决定本轮暂缓 | 同用户换路径安装及连接已通过；干净环境不宣称兼容，公开发布前补验 |
| M11–M14 Agent/MCP | 双客户端调用与额外权限拒绝通过 | M13/M14 完成；M11/M12 已通过真实权限拒绝探针及版本核对 |
| M15–M21 飞书 | 真实单聊收发通过，剩余项待验 | M17–M19 已完成；M15/M16 用户确认；M21 Keychain 迁移完成；普通文本真实负向验证通过，群聊/非绑定用户自动过滤测试通过，真实多身份测试留到 S4 |
| M22–M25 存储与结论 | M22–M25 本轮完成（含明确暂缓项） | 当前测试环境与依赖已固定；干净环境用户暂缓 |
