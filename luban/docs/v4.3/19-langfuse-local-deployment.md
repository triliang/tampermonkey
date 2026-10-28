# Langfuse 本地 Docker 部署与验收

> 2026-10-26 更新：本地容器组已恢复，日常 Bridge 私有配置已安装，同一产品包的隔离真实任务已入库回读；日常个人 Chrome 会话和登录后的 Langfuse UI 仍未验。旧 smoke-only 结论保留日期，当前记录见 [23](23-continuation-2026-10-26.md)。

日期：2026-10-22。关联：[追踪集成](18-langfuse-observability.md)。

## 当前结果

**本地服务已启动，测试追踪已通过 Langfuse v4 API 回读验证。**

- 入口：[http://127.0.0.1:3033](http://127.0.0.1:3033)。已请求在 Codex 浏览器面板打开，工具返回 queued，尚未执行登录后的视觉验收。
- Docker 引擎 29.8.2，Compose v5.6.0；项目名 `luban-langfuse`。
- Web、Worker、PostgreSQL、Redis、ClickHouse、MinIO 共 6 个容器运行，4 个基础服务通过健康检查。
- Web 只绑定 `127.0.0.1:3033`，MinIO 只绑定 `127.0.0.1:9093`；数据库、缓存与 Worker 不发布宿主机端口。
- 测试 trace：`3f5808d91b9e9854ec962d9008b20fff`。通过 `/api/public/v2/observations?traceId=...` 回读到 `luban.chat` 和 `bridge.smoke` 两条 observation。v4 实时入库不应只用旧 traces 接口判断成败。
- 真实验收数据及镜像 digest：[langfuse-local-acceptance.json](evidence/langfuse-local-acceptance.json)。

**尚未启用日常鲁班 Bridge 的追踪配置**；本次成功是独立 metadata-only smoke trace，不是实际页面任务或真实模型会话验收。没有向 Langfuse 提交真实页面、对话或脚本内容。

## 账号与私有配置

本机账号和密码见 [本地登录信息](local-langfuse-access.md)（私有文件，不进入 Git）。

组织 `Luban Local`、项目 `Luban` 使用官方 headless initialization 创建。管理员邮箱为本地标识 `admin@luban.local`。

随机初始化密码、数据库密钥及项目 API keys 位于被 Git 忽略的 `luban/.local/langfuse/.env`；管理员密码字段为 `LANGFUSE_INIT_USER_PASSWORD`，请在本机私密查看。Bridge 使用独立 `luban/.local/langfuse/bridge.env`。目录权限 0700，文件权限 0600，实际密钥没有写入文档或验收记录。

重复 prepare 不重置密钥。服务使用独立命名卷及容器日志轮转；停止命令不删除卷。Langfuse 产品遥测已关闭。本地 v4 配置明确设置 `LUBAN_LANGFUSE_INGESTION_VERSION=4`，其他版本默认不启用该头。

## 使用

在 `luban` 目录，以项目要求的 Node 24.14.1 执行：

```sh
node scripts/langfuse-local.mjs prepare
node scripts/langfuse-local.mjs up
node scripts/langfuse-local.mjs status
node scripts/verify-langfuse-local.mjs
```

部署脚本在 macOS 支持直接调用 Docker.app 内 CLI，不依赖系统命令链接。验证脚本依赖已构建的 Harness；提交 smoke trace 后再回读持久化数据。服务不健康、认证失败或等待后仍未确认入库均返回非零状态，不能把提交动作当验收成功。

停止服务并保留数据：

```sh
node scripts/langfuse-local.mjs down
```

## 日常鲁班接入的剩余步骤

1. 使用更新后的源码重新构建 Harness，并按项目现有流程打包 Bridge。
2. 结束当前运行任务，在加载 `.local/langfuse/bridge.env` 的环境中重新启动 Bridge daemon。仅启动容器，或在终端设置变量后打开 Chrome，不会让已驻留 daemon 自动获得配置。
3. 发送一次普通对话和一次页面补证任务，核对模型/工具调用次数、token、诊断与会话关联；断开接收端确认任务继续。
4. 核对 Langfuse 界面不含真实页面正文、代码或密钥。

本次没有替换 Native Messaging 注册或终止日常 daemon；没有把 smoke 验收当作上述完整任务链路已经通过。

## 验收记录

| 检查项 | 结果 |
| --- | --- |
| 脚本语法与 Compose 解析 | 通过 |
| 私有配置权限、Git 忽略、重复 prepare 不旋转密钥 | 通过 |
| 官方镜像拉取、6 容器启动、4 基础服务健康 | 通过 |
| HTTP 健康与项目密钥认证 | 通过 |
| OTLP 提交及 v4 Observations API 回读 | 通过 |
| 追踪专项测试（含 v4 请求头） | 6 项通过 |
| 登录后的 UI 视觉验收 | 未执行 |
| 日常 Bridge/真实页面任务联通 | 未执行 |

初始 Docker 命令不可用，仅有失效的应用链接。通过 Homebrew 下载官方 Docker Desktop 4.95.0 后，系统链接阶段遇到 sudo 密码要求；未读取或代输管理员密码。Docker.app 已存在并能直接调用，最终通过本机 socket 确认引擎运行。computer use 启动工具曾超时，未将该超时误判为引擎不可用，也未自动接受许可或系统授权。

服务首次冷启动时健康检查尚未就绪；初始化完成后重试通过。上述已解决的前置问题不再是当前阻塞。

配置依据：[官方 Compose 部署](https://langfuse.com/self-hosting/deployment/docker-compose)、[Headless initialization](https://langfuse.com/self-hosting/administration/headless-initialization)。
