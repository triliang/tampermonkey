# V2 P5 标准导出验证

日期：2026-10-14。状态：实现、工程检查与 P5 人工清单验收通过；用户已确认真实 Tampermonkey 样式/GM 兼容等清单项通过。

## 实现

- EXPORT_CURRENT 只允许侧栏/设置页发起，后台重新读取已保存 current，计算 code/grants/runAt SHA-256 并核对保存 hash，不接收前端任意正文作为导出版本。
- acorn 8.19.0 AST 遍历识别实际 GM 依赖，忽略注释和普通字符串。校验声明与支持集，仅输出实际用到的支持授权；无 GM 时使用 @grant none。
- 拒绝函数式/别名 GM_info、GM API 别名、动态全局 GM 引用、modern GM 命名空间、扩展 chrome/私有桥依赖、未知或未声明 grant、不可独立解析的顶层 await/return。宽匹配或未确认规则需先重新生成保存，不伪报兼容。
- 标准头包含 name、namespace、version、准确 match、run-at、grant；名称换行及控制字符净化，文件名非法字符替换。正文原样来自保存版，不附带工作区、对话、模型设置、GM 快照或鲁班 runner。
- 有未保存修改时显式提醒只导出保存版，取消不写数据库。确认后用 Blob/object URL 与 download 链接下载 `.user.js`，不增加 downloads 权限。
- 提示目标管理器不继承鲁班关闭状态、GM 数据独立、双边开启可能重复执行；静态检查通过不等于真实管理器效果通过。
- 鲁班运行时默认提供标准 GM_info 对象；检测到旧直接函数调用时保留兼容路径，导出仍拒绝旧形式，要求用户重新生成/试运行/保存，未静默改写保存正文。

## 工程证据

264 项测试、23 文件通过；typecheck、lint、生产 build 均退出 0。包括标准头、实际授权、注释/字符串、保存版隔离、非法名称、不兼容依赖、版本 hash、GM_info 标准及旧兼容路径。日志见 [测试](./evidence/p5-test.txt)、[类型](./evidence/p5-typecheck.txt)、[lint](./evidence/p5-lint.txt)、[构建](./evidence/p5-build.txt)，[源码摘要](./evidence/p5-source-sha256.json)。

## Computer use 与实际下载

初段使用 Chrome 的普通 HTTP 夹具 `http://localhost:18888/p5-browser.html`：正式 UI/仓储/导出服务，Chrome transport、模型与试运行响应为替身。确认主机搜索、无结果提示、仅保存版导出确认。

点击确认下载后，工具的 download 事件等待超时并重置会话；未重复点击。检查实际 Downloads 中的 `价格一眼可见.user.js`，文件存在，259 字节，包含标准头、准确 `shop.example.com` 匹配、grant none 和 `console.log("saved-a")` 正文。已归档 [实际文件](./evidence/p5-browser-export.user.js)。不把事件等待超时改写成工具下载事件成功。

后续工具恢复时浏览器连接变为 Codex 内置浏览器，另行验证普通 HTTP 夹具：修改为 `DRAFT_ONLY_P5` 后导出提示只含保存版；取消后代码保留，焦点返回“导出保存版”。该部分不是 Chrome 扩展 origin 证据。[弹窗截图](./evidence/p5-export-dialog.png)。

## 人工验收结论

2026-10-14 用户确认 [P5 人工清单](./v2-p5-manual-checklist.md) 全部通过，包含真实扩展下载、保存版隔离、动态依赖阻止、真实 Tampermonkey 样式/GM 导入与匹配边界、持久化及双方数据独立。该结论来源于用户人工验收；具体浏览器和管理器版本、逐项附件未提供，不虚构运行日志。

验收遇到的 EXPORT_CURRENT 消息未识别及 GM_getValue 声明缺失，其排查、修复及复验结论已归档在清单末尾「验收结论与问题闭环」。新增草稿 GM 权限选择；权限变更需重新试运行再保存。
