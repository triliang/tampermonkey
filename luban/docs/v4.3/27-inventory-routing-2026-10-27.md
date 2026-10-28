# 区域清单问句未绑定页面的路由修复

日期：2026-10-27。

## 现场与计划

只读检查本机日常 Bridge 最新会话的授权状态、计数和事件：pageBound=false、模型2次、工具1次，仅有 run.started/run.finished，没有 page.bound 或 analysis.started。页面清单问句未命中现有 PAGE_WORDS，绕过 Extension 的绑定流程直接进入普通聊天；模型随后读取页面得到未授权提示。这与浏览器实际拒绝 activeTab 不等价。未读取或上传业务页面正文。

修复通用区域/位置清单问句路由，并检查明确禁止读取时不采集；不添加广告或站点专用词表。补充跨结构名词、普通聊天、禁止读取反例，再跑真实 Native 首条消息绑定验收。

## 实现与验证

- 新增与站点和业务无关的结构清单句式识别：询问位置、模块、面板、控件、链接、图片、表单、图标等进入既有 page 路由。原有 bind → activeTab 采集 → PageGrants → harness.analyze 顺序不变；不预授予页面权限、不读取其他标签页。
- 明确“不要读取网页”“只解释/讨论”的指令优先保留普通聊天路径，即使消息包含按钮、隐藏等结构词或已有绑定也不因路由主动采集。普通知识问答反例保留。
- 新增 15 项路由反例，相关文件 29 项通过；扩展全量 513 项通过，类型/生产构建/lint 通过。版本仍为 0.4.3，遵循普通修复不自动推进产品阶段规则。
- [真实 Native 验收](evidence/2026-10-27/inventory-routing/native-dom.json) 20 项通过：在隔离 Chrome 工具栏授权后，首条“有哪些提示位”没有“识别/当前页面”旧触发词，仍完成 page.bound → search_dom → read_dom_blocks → report_observation，answered 且未确认/生成/执行；用户原文保留。另回归修改授权、生成/运行/保存、导航失效、临时注册与浏览器清理。模型为本地协议夹具，不能作广告识别准确率证明。
- 证据日志：[扩展](evidence/2026-10-27/inventory-routing/extension.log)、[构建](evidence/2026-10-27/inventory-routing/build.log)、[lint](evidence/2026-10-27/inventory-routing/lint.log)。实际用户会话仅只读诊断，未修改其历史或重新访问业务页面。

## 复核与交付

本轮只修改通用意图路由、测试和验收入口，不增加站点/广告任务词表，不修改 Browser/Bridge 页面授权、目标身份或执行边界。句式路由仍是启发式，不是完整意图理解；无明确页面指代的其他表述仍可能存在歧义。

构建已更新。日常 Chrome 扩展需重新加载后再发原问题，本轮未声称已刷新用户浏览器或原业务页识别成功。Bridge 运行时代码未变化，本轮不需要因这项修复重建或重启 Bridge。

