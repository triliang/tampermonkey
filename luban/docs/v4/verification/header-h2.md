# H2：验收与复核

日期：2026-10-18。完成。

- `npm --prefix luban run build`：类型检查和构建通过。
- `npm --prefix luban run lint`：通过。
- `npm --prefix luban test`：61 个文件、417 项前端测试通过。
- 真实 Chrome：原会话空闲后关闭重开，原生标题保留“鲁班 Luban”，内部只显示 www.csdn.net 和原工具按钮，无第二个 Logo/名称。[截图](./evidence/header-deduplicated.png)
- 复核：嵌入分支继续渲染品牌；窄屏规则仍为紧凑工具栏，网站省略、按钮不挤缩。嵌入页和极窄屏本轮仅代码/回归检查，未另做视觉截图。

仅前端低影响改动，未新增镜像式测试，未重跑未修改的 Bridge/Harness。上轮 504 项全套验收为历史记录，不冒充本轮重跑。
