# 阶段 2：实施与修复

已实现：

- CodexChatModel 继承 LangChain BaseChatModel，接收相同消息历史与绑定工具，使用 App Server outputSchema 返回文本/工具请求；拒绝未知工具、非对象参数、格式错误和强制候选工具绕过。
- API 与 Codex 共用 createRuntime、Deep Agents、SQLite checkpoint、工具 schema 和 Bridge 状态机，生成仍需确认，运行/保存仍独立。
- 原聊天显示“执行方”选择，标签页级选择沿用原键；Codex 分支不读取 API Key。Bridge 按会话隔离模型配置，避免并发标签页覆盖。
- 兼容检查改为功能标志 + 协议 schema 探测，缓存随二进制变化失效。未知限制能力失败关闭。
- Codex 临时线程仅用于模型传输，不接管用户其他聊天；使用独立临时目录且清理。取消/超时清理 worker 进程组，防止遗留 Codex 子进程。
- 模型错误映射为认证、超时、限流、协议不兼容或越权提示，不返回凭据/原始服务错误。

发现并修复：

1. 首次 TypeScript 编译发现 tool_choice 的 unknown 类型不满足 BaseChatModel；改用框架原生 CallOptions 类型后构建通过。
2. 增强限制检查时发现当前 CLI 的 unified_exec 标志固定 true，不能通过设置 false 关闭。没有跳过失败检查：删除该不适用标志，执行工具仍通过 shell_tool=false、code_mode=false、code_mode_host=false 禁用，且所有反向权限请求拒绝；19 项可设置限制均实际检查通过。

初步验收：新增模型适配测试 6 项通过；Harness 全部 15 项通过；扩展类型检查通过。本机 Codex 0.163.0-alpha.10.2 协议与限制能力通过，真实推理结果在阶段 3 记录。
