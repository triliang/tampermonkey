# v4.3 分阶段验收

> 2026-10-26 进度更新见 [继续实施与验收](23-continuation-2026-10-26.md)。本文原日期的实施、断点与验收结果保留，不覆盖后续代码；当前关键真实链路已补验，但完整发布门槛仍有未完成项。

日期：2026-10-22。对照 [07-execution-plan.md](07-execution-plan.md)。本机单测已跑。Computer Use 未能驱动 Chrome，下面单独标出。

## 阶段

| 阶段 | 结果 | 依据 |
| --- | --- | --- |
| P1 失效三元组 | 通过 | `bridge` `node --test`：21 通过，含「约束替换作废确认 / 空白等价保留确认」 |
| P2 宿主 outcome | 通过 | `harness` `npm test`：35 通过，含「只读空选择结束为 answered」 |
| P3 分流与侧栏 | 单测通过 | `luban` `tsc --noEmit` 无错误；`HarnessChat.test.tsx` + `harness-gateway.test.ts`：32 通过。只读 outcome 不出现「确认范围」 |
| P4 回归 | 单测通过 | 上列三组即本轮回归。未把真实 Chrome、Native、模型、Tampermonkey 标成通过 |

## Computer Use

已尝试，未能验收。

- Chrome 在运行（pid 19082）。
- 截图失败：窗口跨显示器，`Window must lie within one display for coordinate capture`。
- 辅助功能树失败：`Accessibility window 22669 for pid 19082 is unavailable`。
- 因此没有点击工具栏、打开侧栏、输入对话，也没有重载未打包扩展。当前 Chrome 里的扩展仍是旧构建。

## 未能验收

- 工具栏图标授予 activeTab，以及失效后提示再次点击图标。
- 命中词表后的真实 scan / bind / analyze，以及同一文档后续消息不重新 bind。
- 侧栏在真实页面上只读结束、`ready` 才出现「确认范围」。
- Native Host、真实模型、Tampermonkey 安装与试运行。
- 日常 Langfuse、增量 DOM 注册。这两项本轮明确不做。
