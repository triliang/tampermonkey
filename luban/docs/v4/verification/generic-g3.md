# G3 自动验收与真实环境边界

日期：2026-10-18。最终执行：`node luban/scripts/verify-v4.mjs --package`。

## 自动结果

12 项检查全部通过：运行时通用边界扫描、Harness 构建/类型/测试、Bridge 语法/测试、扩展类型/Lint/测试/构建、Bridge 打包及包内 smoke。

共 531 项测试通过：扩展 442、Bridge 80、Harness 9。完整输出见 [自动验收记录](./v4-auto-verification.md) 和对应 evidence 文件。Bridge 包版本 0.6.4，未更新本机已安装扩展或正式配对。

| 验收项 | 结果与证据 |
|---|---|
| 普通区域、嵌入区域同一采集机制，无业务分类 | 通过，registry.test.ts |
| 站点/业务名称替换后行为一致 | 通过，registry.test.ts；仅测试夹具保留旧站点命名 |
| 整页/共同祖先误隐藏不得通过 | 通过，registry.test.ts |
| 容器改为正文、深层素材变化、同选择器节点替换失效 | 通过，registry.test.ts |
| 重复 ID 使用通用唯一选择器 | 通过，registry.test.ts |
| 所选区域隐藏/弱化，未选区域不是残留业务目标 | 通过，registry.test.ts |
| 非目标区域误隐藏、移除、弱化阻止通过 | 检查机制覆盖；隐藏/弱化有直接回归用例 |
| 分页和采集截断明确提示；下一批撤销确认与授权 | 通过，registry.test.ts、harness-domain.test.mjs |
| 手动补选满额时保留原所选范围，不能静默丢弃已选目标 | 通过，registry.test.ts、harness-gateway.test.ts |
| 试运行前刷新基线与清除旧效果；无所选目标时拒绝检查 | 通过，harness-gateway.test.ts |
| UI 提供误伤信息，明确局部计划与整体目标不同 | 通过，HarnessChat.test.tsx |
| 原 Chat、生成/试运行/保存授权边界 | 既有集成/回归测试全部通过 |

## 中间失败与修复

初次 Bridge 测试因沙箱不允许 Unix socket 监听失败；经本地验收权限审批后重跑通过。首次完整运行发现新增测试事务回调未声明 async，TypeScript 与构建失败，已修复并重跑。第二轮复核修复满额补选后，完整 12 项再次通过；失败结果未计作通过。

## 真实 Chrome 合成测试：8/8 通过

此前本地地址访问被自动审批拒绝；用户明确批准本次访问范围后，已在真实 Chrome 正常执行 8 项测试，直接使用生产注册器与实际计算样式/布局，全部通过。结果与截图见 [浏览器验收记录](./generic-browser-acceptance.md)。测试标签页和临时服务已关闭。

## 尚未覆盖的真实环境验收

本轮没有验证已安装扩展重新加载后的真实模型分析/生成/运行链路；历史 CSDN 的通过记录不覆盖此次重构。完整业务目标、跨 iframe/Shadow DOM、交互功能和视觉效果仍需要额外证据或用户验收。
