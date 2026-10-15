# V2 P0 运行探针记录

日期：2026-10-13，Asia/Shanghai。状态：**当前 Chrome 环境的 1–6 项手动验证通过；Chrome 138 与部分容量参数仍待补证，P0 尚未整体退出。**

依据：[执行计划 P0](../v2-execution-plan.md)、[技术方案](../v2-technical-design.md)。工程检查见 [基线](./v2-baseline.md)。

## 1. 已交付

独立测试扩展位于 [`spike-v2`](../../../spike-v2/README.md)，与正式鲁班不同 extensionId/IndexedDB，不读取正式脚本或 Key。仅声明 `http://localhost/*` 可选站点权限，没有模型请求。

- userScripts.execute/register/update/getScripts 与 MAIN source 编译探针。
- ISOLATED/document_start 桥与 MAIN/document_end 启动握手；3 秒无回执不执行正文。
- 每次启动 GM 快照、同步/Promise/定时写入队列、null 与删除区分。
- A/B candidate 门禁、PREPARED 日志、SW 启动恢复入口。
- 扩展 origin 的 IDB 跨记录中止、应用容量守卫与 GM_info 行为检查入口。
- localhost 匹配及 127.0.0.1 不匹配夹具、独立普通网页引擎检查。

上述是代码产物，未运行的项目不得写成通过。源码语法及 A/B 注册正文检查通过，证据见 [静态检查](./evidence/spike-static-check.txt)。

## 2. 环境与真实 UI 操作

Google Chrome 155.0.8059.40 Official Build arm64，macOS 26.6.2。原生 computer use 读取 chrome://version，加载本地独立探针并打开选项页，extensionId 为 `mgmniaogpipenlcaajicajkkjchfklbj`。

工具操作前用户明确确认加载扩展、开启用户脚本及授权 localhost。代理自动操作中断时尚未到开启/授权步骤（这是历史状态，不是用户续验后的状态）：详情页显示 Allow User Scripts=off；控制页读取到 permission=false、current=A、auto=false、gm={}。

初次探针控制页返回 PANEL_ONLY。原因是把 sender.tab 存在误判成内容脚本来源，扩展选项页也可能携带 sender.tab。已修改为严格校验 sender.id 与完整 panel.html URL，重载后 status 正常返回。这是**探针修复**，没有修改正式生产消息路由。

随后尝试绑定扩展页读取完整 JSON 时，browser URL policy 拒绝 `chrome-extension://` 并明确禁止 alternate surfaces 绕过。自此停止扩展内部页自动操作，没有通过其他浏览器后端或原生 UI 继续绕过。[拒绝原文](./evidence/browser-policy-block.txt)。

## 3. P0 对照（合并用户续验）

2026-10-13，用户反馈：“1-6手动确认OK，符合预期”。对应本聊天中六项手动验证清单；结论来源为用户确认，不是代理自动执行或 JSON 解析结果。[确认记录](./evidence/manual-confirmation.md)。

| 任务 | 本次结果 | 结论 |
|---|---|---|
| P0-1 工程基线 | 15 文件/161 测试，typecheck/lint/build 退出 0 | 通过 |
| P0-2 两版 Chrome 与 API | 当前环境权限开关失败/恢复、API 和手动 execute 经用户确认；Chrome 138 未确认 | 当前环境通过，最低版本待补 |
| P0-3 桥与缺桥超时 | 自动运行、准确主机匹配、移除桥阻止执行、恢复桥后执行 | 用户手动确认通过 |
| P0-4 GM 持续持久化 | 再次访问读取前次值，同步/Promise/定时计数、null 与 delete | 用户手动确认通过 |
| P0-5 candidate 与 SW 中断恢复 | B 未提交被拒；仅停止/唤醒 SW 与重载扩展恢复 A；提交 B 后执行 B | 用户手动确认通过 |
| P0-6 IDB/容量/GM_info/parser | 扩展检查按钮符合预期；已有 Acorn 8.19.0 解析通过 | 事务、单版守卫与对象语义通过；总容量/对话上限待补 |

“导出证据并清理”包含在用户确认范围中，因此记录为用户确认 auto=false、registered=[]、bridges=[]。随后收到导出 JSON，已按字节归档并解析：[原文](./evidence/runtime-export-chrome155.json)、[核对报告](./evidence/runtime-export-review.md)。快照为清理前 auto=true、registered/bridges 各一项；清理后为空仍只由人工确认支持，不能混淆时点。当前浏览器环境沿用此前读取的 Chrome 155；用户未另行说明 Chrome 138 已执行。

## 4. 可独立验证的普通页面结果

在 `http://localhost:18888/storage-probe.html` 通过 computer use 点击“执行页面引擎检查”，并观察输出与截图：

- IDB readwrite transaction 中先替换 current/previous 再 abort，读取仍为 current=A、previous=OLD。
- 超过 256 KiB 的字符串被**应用层大小守卫**拒绝；不是磁盘 quota exhaustion 试验。
- 标准 GM_info 对象访问有效；把对象当函数调用被 JS 引擎拒绝。

[结果文本](./evidence/page-engine-result.txt)。作用域为普通网页 origin；不冒充扩展 origin 的事务/配额证据，也不代表 Tampermonkey 运行兼容通过。

## 5. 技术结论与未决项

1. 普通页面引擎证据及用户确认的扩展事务中止结果支持 IDB 事务设计；完整业务迁移/并发仍需 P1 实现和验证。
2. 256 KiB 单版应用守卫已由用户确认；40 MiB 总限制、1 MiB 对话上限及相应保护尚未被当前按钮覆盖，仍待容量探针，不把单版守卫当作实际磁盘配额证据。
3. 旧 GM_info() 与标准对象有语义差异，保持“新代码用标准对象、旧代码需确认修复后导出”的方案；本次未做目标管理器兼容验证。
4. Acorn 8.19.0 已作为现有传递依赖可用，静态解析通过；生产依赖锁定留待 P1/相关实施，不在 P0 偷加依赖。
5. sender.tab 不是扩展管理页/内容脚本的充分区分条件；生产消息校验应结合可信 extension origin、精确允许页面与具体消息类型。
6. Chrome 138 及全默认 Chrome 配置仍缺证据；当前浏览器已有用户设置的命令行 flags，详见基线。

## 6. 手动续验步骤（历史操作说明）

浏览器内部页面的自动化访问被工具策略拒绝；需要用户手动执行扩展控制操作，不能让代理更换控制后端绕过。

1. 在 Chrome 中打开探针详情，为**该探针**开启“允许用户脚本”，从详情打开 Extension options。
2. 点“授权本地测试网站”，确认仅 localhost；点“检查 userScripts API”。
3. 点“安装 A 与内容桥”→“新开匹配页面”，应 PASS/A；再开一次，before 中 visits/promiseWrites/timerWrites 应等于前次 after。nullable=null，removeMe 不存在。
4. “新开不匹配页面”应始终 WAITING。“移除内容桥”后新开匹配页应 BLOCKED/3 秒超时；恢复桥后新文档可执行。
5. “注册未提交 B”后新文档应 BLOCKED/current A；实际停止 SW 并唤醒，或重载测试扩展，应恢复注册 A。重载与仅停止 SW 是不同用例，分别记录，不能互相代替。
6. 再注册 B 并提交，确认 new page 执行 B；执行手动 execute、IDB、容量与 GM_info 按钮。
7. 关闭/重新开启用户脚本开关，检查实际 API 调用失败/恢复，不只看 API 对象是否存在。
8. 导出证据 JSON；最后“停用并卸载探针”，状态应 auto=false、注册为空、内容桥为空。另在 Chrome 138 重复必要用例。

服务器仅监听 127.0.0.1:18888。代理自动化中断时未授权或安装动态注册；之后用户完成 1–6 项续验，包含最终停用清理，按用户确认记录当前 auto=false、注册与内容桥为空。探针扩展本身是否关闭未重新读取，不作推断，不清除正式鲁班数据。

当前环境核心运行假设已获人工验证。Chrome 138、总容量/对话上限仍待补齐；本次 JSON 已归档，未覆盖的负向场景与清理状态仍标人工确认；P0 尚不标整体完成。此后用户明确将 Chrome 138 与真实总容量/对话上限延期到最终测试，并授权进入 P1，实施结果见 [P1 记录](./v2-migration-record.md)。

## 7. 附件机器证据补充

已核对并归档 [JSON 原文](./evidence/runtime-export-chrome155.json) 和 [核对结论](./evidence/runtime-export-review.md)。确认两次 pending 启动恢复、A/B 执行、GM 持续写入、IDB 中止、单版容量保护及 GM_info 检查。该快照在停用前导出，不把 auto=true 改写成 false，也不修改原证据。
