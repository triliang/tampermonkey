# V2 P0 独立运行探针

此目录直接作为“加载已解压扩展”的目标，无构建依赖。仅测试 localhost，数据库为 `luban-v2-p0`，不读取正式鲁班的脚本或 Key，不进入生产 dist。

启动夹具：`python3 -m http.server 18888 --bind 127.0.0.1 --directory luban/spike-v2`。

加载后从扩展详情打开选项页 `panel.html`，打开“允许用户脚本”。按顺序：授权本地网站 → 检查 API → 安装 A → 新开匹配页面 → 返回面板刷新查看真实 sender/documentId/GM 日志。再次新开验证读到前次值；127.0.0.1 不匹配。

移除桥后新开页应 BLOCKED/超时；恢复桥后新文档可运行。注册未提交 B 后，新文档应拒绝。保持 pending，实际停止并唤醒 SW 或重新加载此测试扩展，启动恢复应注册已提交 A。提交 B 前先再次注册 candidate。

IDB 中止、容量保护、GM_info 按钮给出真实引擎或应用守卫结果。容量保护不是磁盘 quota exhaustion 验证。GM_info 按钮只是本地标准对象行为检查，不代表 Tampermonkey 兼容验收。

清理：先“停用并卸载探针”，确认不存在注册和内容桥。不要清除正式鲁班数据。本扩展保留证据数据库便于复查。

## P1 普通页面仓储检查

在 luban/ 运行 `node tests/p1/build-browser-probe.mjs` 生成忽略 Git 的 p1-browser.bundle.js；服务器运行时打开 http://localhost:18888/p1-browser.html，点击执行。使用正式仓储源码与独立随机测试 DB，不读取正式扩展数据。此结果不替代扩展 origin 的最终集成验收。
