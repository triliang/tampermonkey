# 鲁班 V4 Harness

独立 Node.js/TypeScript 包，实际运行 Deep Agents。需要 Node v24.14.1（与本地 Bridge 发布基线一致）。

```sh
npm ci
npm run build
npm run check
npm test
```

`src/runtime.ts` 是主 Agent 工厂及双层工具限制；`src/worker.ts` 是 Bridge 管理的独立子进程入口。测试模型不访问外网；实际模型配置由扩展显式启用，经 Bridge 在内存中传给 Worker，不在此目录保存密钥。

全量验收在仓库根目录运行 `node luban/scripts/verify-v4.mjs --package`。部分测试需要本机 socket/子进程权限，不需要真实模型密钥。

产物与真实环境边界见 [V4 总报告](../docs/v4/v4-final-report.md)。

## 本地 Codex 后端

V4 原聊天的“执行方”可选“本地 Codex”。需要本机 ChatGPT/Codex 应用附带的 CLI 已登录；使用其默认模型和账号额度，无需填 API Key。设置页“检查本地 Codex”会核对协议字段和限制能力，不再锁定单一构建号。

`CodexChatModel` 将结构化模型响应转为 LangChain 文本/工具请求，工具由 Deep Agents 和 Bridge 验证执行。原工作区会话与授权流程保留；Codex 临时线程仅作为传输。API 模式仍使用原 AI 设置。

实现与阶段验收见 [本地 Codex 整体报告](../docs/v4/local-codex/06-report.md)。真实模型验收（合成输入，消耗 Codex 账号额度，不执行或保存脚本）：

```sh
node ../bridge/scripts/verify-harness-codex.mjs
```
