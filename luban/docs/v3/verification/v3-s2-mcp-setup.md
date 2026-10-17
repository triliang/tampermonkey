# S2 MCP 安装与连接

状态：开发验证中；真实 Codex/Cursor 业务联调完成前，不宣称双客户端支持。适用 macOS arm64、包内 Node 24.14.1。S0 探针与 `luban_s0` 保持独立。

## 1. 配对

先在正式扩展「连接与集成」连接 Bridge，确认版本 0.5.0。为 Codex、Cursor 分别创建客户端；客户端名称用于辨认，不作为认证。一次性配对码 5 分钟有效。

在终端设置包路径和独立凭据文件路径，然后运行 enrollment。命令不会修改 Codex/Cursor 配置，也不会覆盖同名凭据文件。提示时输入配对码，最后按回车；密钥不出现在命令行参数或 shell 历史。

```bash
LUBAN_PACKAGE="/你的安装路径/luban-bridge-macos-arm64"
LUBAN_CONNECTION="$HOME/Library/Application Support/Luban/mcp/codex.json"
read -rs 'LUBAN_ENROLLMENT?一次性配对码: '
print -r -- "$LUBAN_ENROLLMENT" | "$LUBAN_PACKAGE/luban-mcp-enroll" --connection-config "$LUBAN_CONNECTION"
unset LUBAN_ENROLLMENT
```

以上 `read`/`print` 适用于 macOS 默认 zsh。请勿手动把配对码粘贴进命令文本。文件包含访问凭据，权限必须为 0600、本人所有且不是符号链接；不要加入仓库、截图或诊断文件。Cursor 使用另一个文件，例如 `cursor.json`。

## 2. 客户端配置示例

下列路径均需替换为绝对路径；配置只引用凭据文件，不嵌入 token。将条目合并进已有配置，不覆盖原配置。不需要安装全局 Node/npm。

Codex 的项目或用户 `config.toml`：

```toml
[mcp_servers.luban]
command = "/你的安装路径/luban-bridge-macos-arm64/luban-mcp"
args = ["--connection-config", "/Users/你的用户名/Library/Application Support/Luban/mcp/codex.json"]
startup_timeout_sec = 15
tool_timeout_sec = 30
```

配置字段依据 [Codex 官方 MCP 文档](https://developers.openai.com/codex/mcp)。项目配置是否受信任、工具是否允许调用，由客户端自身提示处理；不能以修改全局自动批准来替代。验收采用独立临时目录与本次进程配置，不修改日常用户配置。

Cursor 的项目 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "luban": {
      "command": "/你的安装路径/luban-bridge-macos-arm64/luban-mcp",
      "args": ["--connection-config", "/Users/你的用户名/Library/Application Support/Luban/mcp/cursor.json"]
    }
  }
}
```

批准范围仅为这个服务和你认可的工作目录；客户端登录、工作目录信任与 MCP 允许调用是不同条件。真实验证结果及版本另见阶段执行记录。

## 3. 开放页面和工具

1. 在准备授权的网页打开鲁班侧栏，在快捷设置授权当前页面。默认只允许页面摘要；没有授权时 `luban_list_pages` 返回空数组。
2. 若需读工具基线或提交候选，先选中目标工具，勾选工具权限再授权。授权精确绑定当前工作区和文档；同网站的其他工具不会因此开放。空白工具可先建立工作区。
3. 客户端调用 `luban_list_pages`，使用返回的 `pageRef` 和 `toolRefs`；不能把数据库 workspace ID 当作 toolRef。
4. `luban_read_page` 返回有限、脱敏摘要。`luban_get_tool` 返回当前有效完整代码及版本；超限明确失败，不把截断代码作为完整基线。
5. `luban_submit_draft` 携带 `expectedDraftRevision` 和稳定 `requestKey`；候选经过原质量检查和版本 CAS，仅更新草稿，不保存。
6. `luban_request_trial` 只创建确认申请。用户必须在鲁班确认卡核对来源、目标、版本后确认；拒绝不执行，已消费确认不重复运行。

导航、关页、撤销、断连与 worker 重启会使页面授权失效，需要重新授权。不自动跟随活动标签页。

## 4. 查询、取消与恢复

所有提交返回真实 `taskId`，不代表已完成。读请求短暂等待后仍可能返回 queued/running，应调用 `luban_get_task` 查询。`afterSeq` 可增量读取事件。

同一写入意图重试必须复用 `requestKey`；新的修改或新试运行必须换 key。JSON-RPC 请求 ID 不承担跨重连去重。超时不自动重发写操作，先查询原任务。

`luban_cancel_task` 返回取消请求的实际状态；cancelRequested 不等于已经停止。客户端关闭会取消该连接提交的 queued/running 工作，迟到结果不能提交。已经进入 waitingUser 的本地确认保留，关闭客户端不等于拒绝该确认；需要在本地拒绝或主动取消。未知执行结果需要核对，不能宣称副作用已撤销。

## 5. 撤销与排错

- 撤销页面授权后不再读页面/基线；历史读取任务的缓存代码同样隐藏。
- 在连接设置撤销客户端，旧凭据立即不能发起访问。删除该客户端自己的凭据文件并移除对应配置项；保留其他客户端与用户工具。
- `MCP_CONFIG_MISSING/UNSAFE/INVALID`：检查路径、所有者和 0600 权限，重新配对时用新文件；不要将文件内容发到聊天。
- `BRIDGE_UNAVAILABLE`：检查正式 Bridge 连接与客户端配对。MCP 握手成功不等于业务认证可用。
- `PAGE_NOT_GRANTED/TOOL_NOT_GRANTED`：重新明确授权，并重新发现引用；不猜测旧 ID。
- `WORKSPACE_BUSY` 或版本冲突：等待或获取最新基线后新建修改请求；不覆盖现有草稿。

P0 仅提供七个工具：list_pages、read_page、get_tool、submit_draft、request_trial、get_task、cancel_task（均以 `luban_` 开头）。不提供通用消息、任意 JS、保存、恢复或删除接口。


## 6. 2026-10-17 真实 CLI 联调补充

Codex 0.162.0-alpha.17.2 与 Cursor 2026.10.16-e3cb207 均已实际发现七个工具，并分别完成页面摘要、完整基线读取和候选提交至 completed。真实报告见 [整体联调记录](./v3-real-acceptance-2026-10-17.md)。恢复/竞争分支仍按该记录逐项判断，不能由这两个正向结果推定全量通过。

- Cursor 的服务批准与逐工具允许是两层。仅在本次独立项目 `.cursor/cli.json` 加入所需 `Mcp(luban_v3_acceptance:luban_list_pages)` 等明确工具规则；不使用 force/yolo/approve-mcps。必须从该临时目录实际启动进程：本机版本仅传 `--workspace` 时未加载该目录的项目权限规则。
- Codex 无交互 exec 的默认 never 策略会拒绝需批准的写工具，读取成功不代表已提交。若用户明确批准本次验收，可仅为当前进程设置 `mcp_servers.luban_v3_acceptance.tools.luban_submit_draft.approval_mode="approve"` 等指定工具配置；不更改全局审批，不开放额外服务。外部 `request_trial` 仍必须经过鲁班本地确认。[官方逐工具配置说明](https://developers.openai.com/codex/config-reference)。
- 正常交互使用时保留客户端自己的逐次批准流程。临时规则、凭据和配对验完撤销，不复制到日常项目。
