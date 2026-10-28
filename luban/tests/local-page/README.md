# CSDN 公开首页冻结测试副本

抓取时间、原文哈希见 capture.json。未使用登录 Cookie。原始 HTML 仅供溯源，不由本地服务开放；页面来源 https://www.csdn.net/ 。此副本仅作项目本地测试，不用于公开发布。

从 luban 目录运行：

```sh
npm run preview:local-page
npm run test:local-page
```

浏览器访问 http://127.0.0.1:4318/ 。服务仅绑定回环地址，仅开放 index 和缓存资源白名单。无需鲁班扩展或 Bridge。

- public-source.html：原始响应；capture.json：来源和 SHA256。
- prepare.mjs：从原文重建 site/index.html，重新运行不会下载资源。
- assets.json / asset-results.json：66 个资源的来源与缓存结果，当前均成功。
- site/：冻结页面、样式、图片，可直接离线启动；CSS 背景图、字体及导入已移除。
- snapshot.test.ts：生产结构采集与目标引用回归，以及可信手写参考效果。
- structure-result.json / test-results.log：最新验证证据。
- browser-preview.png：Chrome 打开本地页面的实际截图。

原站脚本、事件、表单、iframe、外部请求已禁用；链接改为页内锚点；仅在测试副本移除 layout-wrapper 的启动隐藏 class。原站异步内容、轮播、登录、滚动加载、iframe/Shadow DOM 未复制。它是静态快照，不是完整站点镜像。

jsdom 使用模拟矩形，不能证明真实可见性。参考动作由测试作者写定，不能证明模型生成正确；生产通用候选仍须经过 reviewOnly 后续的隔离运行和效果验收。原 112 项清单不因这 10 项测试自动通过。

## 按47号用例复验通用生成推进

```sh
node tests/local-page/domain-audit.mjs
node tests/local-page/automatic-worker-round.mjs
```

后一个命令使用本地模型协议夹具和真实Worker，生成26份只读候选证据，不代表真实模型理解正确，也不执行候选。最新证据位于 docs/v4.3/evidence/2026-10-28/local-round2/；原首轮失败证据保持在local-round1。
