# 五个真实网站的通用能力验收报告

更新：2026-10-19（Asia/Shanghai）。本轮已完成五个有效广告/商业推广网站的所选范围验证：博客园、CSDN、IT之家、搜狐、新浪；另完成51CTO品牌推广补充案例。**结论是确认范围的通用流程有效，不代表每站所有广告已全部隐藏。**

## 逐站结果

| 网站 | 本轮确认范围 | 最终结果 | 非目标检查 | 证据 |
|---|---|---|---:|---|
| 博客园 | 顶部火山引擎通栏，候选22 | 已隐藏，延后复查通过 | 757处，0异常 | [截图](./verification/evidence/five-sites/cnblogs-after.png) · [面板](./verification/evidence/five-sites/cnblogs-panel.txt) |
| CSDN | 顶部广告曾单独验证；重点追加右侧完整广告模块，含标签和六个素材位置 | 右侧标签、轮播、占位整体隐藏；新闻、普通项目轮播、社区推荐保留 | 1312处，0异常；延后曾出现1个动态圆点异常，随后为0 | [整模块截图](./verification/evidence/five-sites/csdn-complete-module.png) · [DOM](./verification/evidence/five-sites/csdn-complete-module.json) · [模型复核](./verification/evidence/five-sites/csdn-model-recheck.txt) |
| IT之家 | 第二批购物广告横幅26，包含左右购物素材与“广告”标签 | 已隐藏；相邻新闻保留 | 1255处，0异常 | [截图](./verification/evidence/five-sites/ithome-after.png) · [面板](./verification/evidence/five-sites/ithome-panel.txt) |
| 搜狐 | 页面下方带明确“广告”标签的独立图片模块40 | 模块已隐藏，科技、时尚、教育、搜狐号等相邻内容保留 | 1774处，0异常 | [隐藏前](./verification/evidence/five-sites/sohu-ad-before.png) · [隐藏后](./verification/evidence/five-sites/sohu-after.png) · [面板](./verification/evidence/five-sites/sohu-panel.txt) |
| 新浪 | 带“商讯/广告”标题的独立购物推广模块40 | 修复自然收缩误报后，整块隐藏；上方新闻及相邻模块保留 | 2045处，0异常 | [隐藏前](./verification/evidence/five-sites/sina-ad-before.png) · [隐藏后](./verification/evidence/five-sites/sina-final.png) · [面板](./verification/evidence/five-sites/sina-final-panel.txt) |

补充案例51CTO：品牌直播整卡片16隐藏，左卡406×234保留，1483处非目标检查、0异常，见[截图](./verification/evidence/five-sites/51cto-complete-card.png)。品牌直播不直接当作付费广告识别率样本。

菜鸟教程：首页及Python3正文无可见填充广告，不计Luban成功。OSChina：新闻与社区活动混合轮播，真实模型保留，不整块隐藏，也不计广告清理成功。浏览器原有Adblock Plus保持启用，没有改变其配置；只对实际可见素材归因。

## 发现和修复

1. **编号不一致**：模型选22却称1。系统提示要求沿用证据label，界面增加确定性当前选择摘要。博客园真实重试正确引用22。
2. **长页面检查不足**：目标发现预算800、每批40；非目标保留预算独立为10000，并缓存单次展示计算。超预算仍报告不完整，不能宣称全页完成。
3. **无文字区域难理解**：空白文本trim后展示中性href/src。没有将空白、iframe或品牌名直接当广告。
4. **轮播误判失效**：内容指纹统一忽略后代展示class；根属性、文本、资源地址、结构、原节点身份及唯一选择器仍验证。真实CSDN轮播可以通过校验；素材真正改变仍需重新确认。
5. **子范围隐藏不完整**：CSDN只选轮播时标签和外层仍在，重新确认含标签的完整模块；51CTO从图片容器改为整卡片。通过通用点选/父级提升和重新授权解决，未增加自动广告容器归并规则。
6. **自然收缩误报**：新浪目标已隐藏，空包裹层自然零高度却被当成误伤。基线记录独立文本；只允许样式仍可见、无独立文本、包含所选范围的普通包裹层自然收缩，未选子节点仍逐项保护。根文档/导航/正文等受保护区域、真实样式隐藏、节点移除、透明度降低继续失败。新增通用反例并真实复测通过。

产品修改集中于通用TargetRegistry、选择摘要和Harness提示；没有加入站点域名、专用广告关键词或站点选择器。选择器只存在本次生成草稿和验收证据中。[AGENTS.md规则](../../AGENTS.md) 与运行时边界扫描持续约束这一点。

## Chat与Harness能力边界

- 分析、目标确认、方案及生成授权、应用草稿、运行、保存分离。真实模型与原Native配对链路均已使用；本轮没有保存脚本或启用自动运行。
- 有些目标由验收代理使用通用手动补选提供，再交真实模型分析，不能宣称Agent自动找全五站所有广告。
- 模型拿到结构和文字说明；截图视觉含义由验收代理核对。不能把结构工具未读取的iframe内部或图片当成模型已经直接看见的证据。
- CSDN延后检查曾把普通项目轮播非激活圆点opacity0.24报为非目标弱化，随后再次采集为0异常。保留两次记录；现有检查不能稳定区分所有自然动态变化和执行因果，没有通过按钮白名单掩盖这一限制。
- 未选广告可能继续存在。全页广告召回、跨iframe内部语义、Shadow DOM、未来动态插入、普通内容交互功能仍需要独立验收，不能用局部效果卡替代。

## 自动验收及版本证据

最新538项测试通过：扩展449、Bridge80、Harness9；构建、类型、lint、边界扫描与打包通过。12项检查最终均有通过证据，其中包smoke首跑因10秒超时失败，关闭已取证重页面后仅复跑该项通过，未放宽超时或跳过用例。见[完整记录](./verification/v4-auto-verification.md)。

新增布局模拟测试首跑因实例mock误改继承的全局spy而失败，修正测试夹具后29项相关测试和全池449项通过，失败日志保留。首次模型超时、不合规候选、失效基线、未完整范围、自然收缩误报均保留阶段记录，没有用模拟成功替代。

本轮经过多次构建迭代：前三站先验证编号/预算改进，CSDN重点复测展示指纹修复，新浪最后验证自然收缩修复。不能把它写成最后同一个构建上五站整条链路全部重跑，更不能宣称每站全页去广告通过。

## 阶段输出与清理

[执行计划](./v4-five-site-acceptance-plan.md) · [R1环境与样本](./verification/five-site-r1.md) · [R2实施与验收](./verification/five-site-r2.md) · [R3复核修复](./verification/five-site-r3.md) · [R4交付](./verification/five-site-r4.md)。

所有新建验收页在取证后关闭；关闭撤销对应临时页面效果。用户原有标签页、配对、模型配置、拦截器设置保持。没有登录、保存脚本、开启自动运行或发送飞书。
