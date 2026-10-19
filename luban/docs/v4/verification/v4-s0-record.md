# V4 S0：Deep Agents 基线验收

## 最新真实验收补充（2026-10-18）

真实 MiMo 模型完成普通对话及 propose_requirement 调用；普通对话结束前没有页面授权或脚本制品。结构化生成已由真实端点跑通。SDK 回归现为 7 项；本机协议模型仍与真实调用分开计数。

详情、失败修复与截图见 [真实环境验收记录](./v4-real-acceptance-record.md)；最新退出码见 [统一自动验收](./v4-auto-verification.md)。以下为之前阶段的历史记录，涉及“未验收”的状态以本节和真实验收记录为准。

---

日期：2026-10-18。状态：自动 SDK 契约通过；真实远程模型待验。

## 标准与结果

| 编号 | 标准 | 结果与证据 |
|---|---|---|
| S0-01 | 精确依赖与独立构建 | `luban/harness/package.json`、lockfile；`npm run build` 通过 |
| S0-02 | 模型实际只绑定领域工具，聊天不调用页面或生成 | 真实 createDeepAgent + ScriptedModel 测试通过 |
| S0-03 | SDK 可执行允许工具 | read_page_context 经 dispatch 真实调用通过 |
| S0-04 | SQLite 中断可在销毁/重建 runtime 后恢复 | 真实 SqliteSaver、interrupt、Command 测试通过，恢复后只调一次领域校验 |
| S0-05 | 不安全端点配置拒绝 | 远程明文、URL 凭据和查询参数拒绝测试通过 |

命令：`cd luban/harness && npm run build && npm test`。当前 4 项通过。

## 修复与设计落地

实际 SDK 为 deepagents 1.15.1；使用真实 TS 类型编译，修复模型工具集合的联合类型过滤。以模型调用前过滤和派发侧拒绝双重限制内置工具，文件后端默认拒绝所有读写。首期比原设计更严格：不开放笔记文件工具，避免未经验证的路径权限实现。

## 非自动验收

尚未使用用户真实模型端点/密钥验证工具调用、计费、延迟和语义质量。ScriptedModel 只替代模型网络，框架、工具循环和 SQLite 均为真实 SDK；不作为真实模型兼容证明。

末轮追加：真实 SDK 禁用工具攻击用例已加入，最终 Harness 套件 5 项通过；精确命令退出码见统一自动验收记录。

## 单一 Chat 后续更新（2026-10-18）

本阶段后追加原 Chat 原位升级与兼容复核，见 [U1–U3 执行计划](../v4-unified-chat-execution-plan.md) 和 [最终追加验收](./unified-chat-u3.md)。原独立入口由统一 Chat 替代，历史真实验收结果保留，最新自动回归为 496 项。
