# V4 S3：独立 Worker 与 Bridge 连接

## 最新真实验收补充（2026-10-18）

实际 Chrome 已连接 Native Host 0.6.0，沿用已有配对，0 授权时页面访问检查正确拒绝。真实模型对话、结构化生成、重连后重新启用模型成功。修复 SDK 输出解析兼容；失败分类不保存密钥或原始响应。首次全新配对、真实提供方限流和强制断网仍未专门触发。

详情、失败修复与截图见 [真实环境验收记录](./v4-real-acceptance-record.md)；最新退出码见 [统一自动验收](./v4-auto-verification.md)。以下为之前阶段的历史记录，涉及“未验收”的状态以本节和真实验收记录为准。

---

日期：2026-10-18。状态：已实施，SDK/服务隔离自动验收通过；真实 Native 配对待验。

| 编号 | 标准 | 自动检查 |
|---|---|---|
| S3-01 | 独立子进程，模型配置仅驻留内存，不进领域库 | HarnessService lifecycle 测试与源码审查 |
| S3-02 | 断连/取消清除凭据配置，迟到输出不覆盖新状态 | service cancellation 测试通过 |
| S3-03 | 独立 harness.* 方法、沿用 Native 配对与 profile 身份 | protocol 白名单和 NativeGateway 回归 |
| S3-04 | 无配置或 Worker 构建缺失明确不可用 | service 测试通过 |
| S3-05 | 真实 SDK Worker 可编译 | `npm --prefix luban/harness run build` 通过 |

命令：`cd luban/bridge && node --test test/harness-service.test.mjs test/harness-domain.test.mjs`，5 项通过。

实现增加私有 harness 目录、SQLite 领域存储、每次运行独立 Worker、120/200 秒预算、最多 4 个活动运行、域工具 IPC 回调、固定协议与原 Agent 通道并存。发布打包脚本包含 harness 编译产物和独立依赖。

非自动：真实 Native Host 注册/安装、真实模型凭据与调用结果、macOS 原生发布包安装；不得将替身子进程测试视为这些项目通过。

## 单一 Chat 后续更新（2026-10-18）

本阶段后追加原 Chat 原位升级与兼容复核，见 [U1–U3 执行计划](../v4-unified-chat-execution-plan.md) 和 [最终追加验收](./unified-chat-u3.md)。原独立入口由统一 Chat 替代，历史真实验收结果保留，最新自动回归为 496 项。
