# V3 S0 执行记录

日期：2026-10-16。阶段状态：本轮个人试点验收完成（含用户明确暂缓的干净环境项），可以进入 S1。仅声明已测 macOS arm64、当前固定 CLI/SDK 的支持范围，不代表公开发布或全环境兼容。以下保留按时间记录的历史待验状态，以本节和最新结论为准。

## 1. 现有基线

Git HEAD：`cd92a19fe55254b96f9c899773b6c55f095a725e`。开始时存在 `.baoyu-skills/`、`.playwright-mcp/`、两张根目录图片及 `luban/docs/v3/` 未跟踪内容；均保留。工作区与父目录未找到用户引用的 RTK.md；未假称已读取该文件。

原扩展 typecheck、lint、test、build 均通过；测试 41 个文件、339 项。构建仍有既有 inlineDynamicImports 提示。本轮没有修改正式扩展 `src/`、manifest 或原 package/lockfile；V3 代码隔离在 `luban/bridge/`。

## 2. 本轮实现

- 固定依赖与 lockfile 的独立 S0 包；Native JSON 帧解析、请求 schema 与 Origin 校验。
- 固定公钥/扩展 ID 的健康检查扩展、未授权来源对照扩展及用户级 Host 注册/卸载脚本。
- 内置 Node 的 macOS arm64 包，Node 许可文本和 runtime 摘要；移到含空格新路径、无 PATH 仍可运行。
- 官方 SDK 的最小 MCP 服务，只开放 `luban_probe_health`，没有网页、文件或写操作能力。
- Codex App Server 初始化/登录/两轮/中断探针；真实 Codex MCP 调用探针；Cursor 独立配置与批准流程。
- SQLite/保留保护测试、Keychain 临时随机条目测试；有界飞书单聊收发探针及 0600 本机配置空模板。

## 3. 已取得结果

| 验证 | 结果 | 证据/限制 |
|---|---|---|
| 新包 JS 语法检查 | 通过 | [check](./evidence/s0/bridge-check.txt)；不是 TS 类型检查 |
| Native/Origin/保留/SQLite 自动测试 | 10/10 通过 | [tests](./evidence/s0/bridge-tests.txt)，包括 experimental SQLite 警告和错误配置不泄露密钥测试 |
| SDK MCP 调用 | 通过 | [SDK probe](./evidence/s0/mcp-sdk-probe.txt)；不能代替真实客户端 |
| 内置运行时迁移 smoke | 通过 | [package smoke](./evidence/s0/package-smoke.txt)；不是干净机器验收 |
| Codex 登录与 App Server | 通过已执行部分 | authenticated=true；两次 completed；中断 interrupted；文本请求无文件/网页访问 |
| Codex 实际 MCP 调用 | 通过 | CLI JSON 事件中确认 mcp_tool_call completed / luban_probe_health；只记录结果，不保存账号原始日志 |
| 稳定 SQLite 驱动 | 通过本机与打包验证 | better-sqlite3 13.0.3 / SQLite 3.53.4；[probe](./evidence/s0/sqlite-stable-probe.txt)，换路径包内 Node 加载通过；干净环境待验 |
| Keychain | 通过已执行部分 | KEYCHAIN_PROBE_PASS；随机测试项已删除；无 Secret 输出 |
| Native Host 注册 | 已完成 | 仅 com.luban.s0_probe，允许固定验证 ID；未修改其他 Host；Chrome 首次连接、重连、未授权拒绝及重启连接通过（用户反馈） |
| Cursor | 真实 MCP 调用通过 | 用户确认 CLI 登录和临时目录信任；精确工具白名单下完成调用，healthVerified=true |
| 飞书 | 真实单聊收发通过 | 已绑定本人；接收过滤全部匹配，平台 code=0，用户收到预期回复；[证据](./evidence/s0/feishu-roundtrip.json) |

真实探针执行结果摘要在 [observed results](./evidence/s0/observed-results.json)，不含登录凭据或原始账号日志。

源码与 Codex 生成 schema 的摘要在 [source hashes](./evidence/s0/source-sha256.json)、[schema hashes](./evidence/s0/codex-schema-sha256.json)。schema 实际由本机官方 binary 生成，原始临时目录不含登录凭据。

## 4. 对阶段出口的判断

| 验收项 | 当前结论 | 剩余内容 |
|---|---|---|
| S0-A1 | 本轮暂缓（用户决定） | 同用户迁移/安装/连接已通过；干净环境因成本高暂缓，不阻塞后续个人试用开发 |
| S0-A2 | 通过 | 程序测试及用户提供的 Chrome 首次连接、重连、拒绝与重启结果通过；Chrome 版本/配置档元信息待补 |
| S0-A3 | 通过（当前试点环境） | 驱动、Keychain 及新路径包验证通过；其他 OS/架构不在声明范围，干净环境用户暂缓 |
| S0-A4 | 通过（当前 CLI 版本） | 两轮/中断及真实额外审批等待/decline 已过；不声明稳定生产发行兼容 |
| S0-A5 | 通过 | Codex 与 Cursor 分别真实调用健康工具；Cursor 完成事件与实际健康内容已核对 |
| S0-A6 | 通过 | 已绑定用户真实单聊收取并回复成功，平台 messageId 与用户收到回复的反馈可核对 |
| S0-A7 | 通过（个人试点冻结） | [版本/参数](./v3-s0-dependencies.md)已固定；支持仅覆盖已测环境，未验证环境不宣称支持 |

前两次 SQLite 下载申请因自动审核超时未执行。用户再次明确授权后下载成功；已精确锁定 better-sqlite3 13.0.3，禁用安装脚本，包内预编译模块通过持久化、去重、回滚及迁移路径加载验证。该依赖安装阻塞已解除，不代表 S0 整体通过。

阻塞是真实环境与授权条件，未伪造通过。可继续完善 S0 探针和证据；S1 正式接入前需完成相应门槛。用户无需重新批准阶段开发，只需按 [人工清单](./v3-s0-manual-checklist.md) 提供上述真实条件与结果。

## 5. 人工反馈补充

2026-10-16：用户反馈 Chrome 已加载验证扩展，实际 ID 为 `llgpaikkfllijemnfpgfnhdpmcofeadi`，与固定公钥预期一致。M01 加载/ID 核对已确认，Chrome 版本/配置档仍待补充；M02 健康结果、重连和未授权来源测试尚未反馈，S0-A2 不因此标为整体通过。

2026-10-16：用户提供真实 Chrome Native health 返回，M02 通过：protocolVersion=1、ok=true、service=luban-s0-native-probe、Node v24.14.1、darwin/arm64、无页面能力。证据：[用户提供的返回](./evidence/s0/chrome-native-health-user.json)。已证实 Chrome→Native Host→内置 Node 的双向通信；M03 重连、M04 未授权来源拒绝、M05 Chrome 重启仍待反馈，S0-A2 未整体关闭。

2026-10-16：用户反馈“重连成功”，M03 通过（用户人工反馈）。首次连接及断开后重连已确认；M04 未授权来源拒绝、M05 Chrome 重启仍待反馈，S0-A2 未整体关闭。

2026-10-16：用户提供对照扩展实际提示 `Access to the specified native messaging host is forbidden.`，M04 未授权来源拒绝通过（用户人工反馈）。Chrome 首次连接、重连及未授权来源拒绝已通过；M05 完全退出 Chrome 后重新连接仍待验，S0-A2 尚未整体关闭。

2026-10-16：用户反馈“重启后连接成功”，M05 通过。结合 M01–M04，S0-A2 本机 Native 通道功能验收通过；Chrome 具体版本及配置档信息仍待补充。该结论不代替 S0-A1 干净环境安装、真实客户端/飞书及依赖兼容矩阵的验收，S0 整体仍未关闭。

2026-10-16：用户确认 Cursor CLI 已登录，并明确授权仅信任独立 S0 临时目录。验证发现强制 sandbox 在本系统不可用，未改变全局设置；改用 ask 模式，临时 `.cursor/cli.json` 仅允许 `Mcp(luban_s0:luban_probe_health)`，拒绝 Shell/Read/Write/WebFetch。[Cursor 官方配置](https://prod.cursor.com/docs/cli/reference/permissions)。最初 completed 事件含 rejected 结果，未将其当作成功；增加健康结果校验和拒绝结果回归测试后，真实调用返回 called=true、healthVerified=true，S0-A5 通过。未启用 yolo/force/approve-mcps，也未修改全局权限。

飞书专用配置仅核对字段是否填写，未输出任何值；当前 appSecret 和 senderOpenId 仍未配置，S0-A6 仍阻塞。S0 整体仍需干净环境、额外审批与兼容矩阵验收。

2026-10-16：用户确认 appSecret 已填写；仅检查字段是否为空和文件权限，未输出密钥。新增五分钟、随机一次性验证码的 receive-only 身份发现探针：过滤群聊/机器人/非文本/错误验证码/过期消息，不自动绑定。新增过滤回归测试通过；已启动真实监听，等待用户从本人账号单聊发送验证码。此步骤尚不构成飞书回复验收通过。

2026-10-16：一次性验证码身份发现成功，用户确认候选为本人并明确授权绑定；已原子写入本机 0600 配置。首次 60 秒收发探针超时，未取得匹配消息记录，不能推断为发送权限失败。将窗口延长至 5 分钟，增加仅布尔值的私聊/用户/绑定/命令过滤诊断和发送阶段结果；加入空白容忍、错误用户/群聊/机器人拒绝测试，通过后重新启动。当前等待用户重发测试消息，S0-A6 未通过。

2026-10-16：五分钟收发探针收到第一条事件，私聊、绑定发送者、用户身份、文本及命令均匹配；消息发送 code=0、platform-accepted，用户提供预期回复，S0-A6 通过。未执行任何网页操作。权限最小化清单、其他发送者/群聊真实负向验证、临时凭据清理仍按人工清单待验；S0 整体尚未关闭。

2026-10-16：同一用户换路径安装验证通过。旧 S0 注册经所有权校验后由旧安装器卸载，新包注册到 `~/code/tmp/luban-s0-macos-arm64/native-host`，allowlist 未变。用户断开并重新连接后反馈 `ok:true`。已验证新路径启动；不作为 S0-A1 的干净用户环境通过证据。当前有效 Host 注册指向新包，后续卸载需使用新包路径。

2026-10-16 范围调整：用户明确表示干净环境验证成本太高，先忽略。M06 及 M07–M10 中依赖干净用户环境的部分暂缓，S0-A1 不记通过；该项不再作为本轮个人本地试用开发的阻断门槛。已有同用户换路径安装及连接证据保留。公开发布或声明干净环境兼容前应补验。此调整不自动关闭其他 S0 未决项。

2026-10-16 继续验收：Codex 真实额外命令审批等待/decline 通过，marker 未创建；固定当前已测 alpha CLI 用于个人试点，稳定公开发行另验。用户确认飞书单机监听且仅必要权限（用户声明，未冒充后台 scope 审计）。Keychain 迁移实际应用 Secret 后读回一致，配置已移除明文；新路径安装包的 SQLite 持久化/去重/回滚再次通过。依赖/预算按本机试点范围冻结，未验证 OS/架构不宣称支持。普通文本 receive-only 负向探针已启动，等待用户发送 LUBAN_S0_IGNORE；不回复、不执行网页。

## 本轮阶段出口结论

2026-10-16：普通文本真实负向验证通过：eventReceived=true、commandMatched=false、replyAttempted=false。S0-A2–A7 按本机个人试点范围通过；S0-A1 干净用户环境按用户要求暂缓，不计通过但不阻塞后续开发。真实群聊/未绑定用户负向矩阵保留给 S4，目前仅自动过滤测试覆盖。S0 本轮关闭并进入 S1；公开稳定发行、多 OS/架构及干净环境不作兼容承诺。
