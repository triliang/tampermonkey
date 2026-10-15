# V2 P4 自动运行与注册一致性验证

日期：2026-10-14，Asia/Shanghai。状态：P4 实现、工程检查及 HTTP 夹具交互检查完成；真实扩展主流程与强制中断证据待完成，尚未全量退出。

## 实际验收问题：新页面未自动执行（授权修正后复验通过）

用户执行手动清单第 2 项后报告不符合预期，且控制台没有错误。computer use 读取 Chrome 的实际测试标签页并刷新重现：页面仍显示 WAITING，捕获的 warn/error 日志为空。此主流程记录为失败待定位，不将原有 mock 测试通过当作真实验收通过。

已新增侧栏「查看自动运行诊断」只读入口，用于对照 desired、generation、current version/hash、网站权限、实际 userScripts 注册身份、内容桥注册与 pending 操作。诊断不返回 Key、代码正文或 GM 数据；需要用户重新加载最新 dist 后从正式侧栏获取。当前尚未确定根因，也未宣称问题已修复。

### 授权阶段排查与请求修正

用户随后提供真实诊断：desired=false、generation=0、permission=false、registered/bridge 均为 null，pending 为空；点击开启后 Chrome 返回 `Only permissions specified in the manifest may be requested.`。据此确定失败发生在网站授权阶段，尚未进入自动注册，不是用户正文执行错误。

权限请求与 contains 核对已统一改为 `http://localhost/*`、`https://localhost/*` 两项准确主机 origins，逐项对应 manifest 的 HTTP/HTTPS 可选权限声明；注册 matches 仍使用准确主机的通配协议规则。诊断新增实际加载的 declaredOptionalHostPermissions 和 requestedOrigins，可区分请求形式问题与旧 manifest 未刷新/加载目录不一致。未增加安装时全站授权。

修正后 21 文件、246 项测试、typecheck/lint/build 通过，日志见 evidence/p4-permission-*.txt。随后用户选中手动清单第 2 节“开启并验证自动注册”确认“符合预期”，记录为本节整体人工复验通过（准确授权、localhost 新页面自动运行、127.0.0.1 不运行）。原失败过程保留；本结论来自用户确认，不改写成 computer use 自动验收。其他主流程与精确故障断点仍按原表待验收。

## 实现范围

- Manifest 增加可选 HTTP/HTTPS 主机权限，安装时不授予全部网站。用户点击开启按钮时请求准确 `*://hostname/*`，后台再核对实际权限及准确主机；拒绝授权保留保存版和关闭状态。
- 每准确主机一座 ISOLATED/document_start 桥，每工具一个 MAIN/document_end 注册。旧版非 document_end 或宽匹配工具需重新生成、试运行并保存，不能自动转为宽授权。
- 注册 source 含正文与身份，不含长期 GM 快照。启动壳通过有限协议取得最新 GM 与 document 绑定 lease，3 秒无有效回执则不执行正文。后台核对真实 sender、顶层 document、当前 URL/主机、权限、desired/generation、current versionId/hash、注册状态和 pending 日志。
- 同工具同文档只执行一次；SPA 无刷新跳转不重复运行。正文完成后，定时器/Promise 的 GM 写入仍按 lease/seq 提交；null/set 和 delete 区分，事务顺序保证不同 key 不丢写，同 key 最后提交生效。重复序号只应答，不重复应用。
- 更新/恢复：先写 PREPARED 日志，再替换 Chrome source，最后提交版本事务并移除日志。pending 期间暂停该工具启动及旧 lease 写入。候选不能提前执行；提交失败回补 DB.current，回补失败保留日志并显示不可用。
- 关闭先提交 desired=false/generation，再卸载注册；删除先 tombstone 禁运行，再卸载和清理数据。清理失败可见且可重试，不复活 tombstone。
- 每次 SW 启动、浏览器启动及权限移除时核对 committed 数据与注册。恢复不重新请求权限、不自动开启旧脚本；清除孤立注册及不再需要的桥。
- 侧栏增加准确网站授权开关、运行状态、重试和删除确认；开启自动运行的保存/恢复接入同一协调器。运行问题汇总独立于工具列表展示，tombstone 清理失败后重新打开仍可看到提示与重试入口。停用清理失败后重新读取后台状态，界面显示已关闭及清理待重试。

主要源码：`src/auto/bridge.ts`、`services/auto-{runtime,adapter,source,origin}.ts`、`shared/{host-policy,p4-types}.ts`，以及 VersionService、SW 路由与侧栏接入。

## 工程证据

| 检查 | 结果 | 证据 |
|---|---|---|
| npm test | 20 文件、243 项通过；新增 23 项 P4 测试 | [日志](./evidence/p4-test.txt) |
| typecheck | 退出 0 | [日志](./evidence/p4-typecheck.txt) |
| lint | 退出 0 | [日志](./evidence/p4-lint.txt) |
| build | 退出 0，生成独立桥 IIFE 和生产 manifest | [日志](./evidence/p4-build.txt) |

[源码摘要](./evidence/p4-source-sha256.json)。测试同时覆盖实际生成的 runner source 与内存桥联动：同步/Promise/正文结束后的 timer 写入、再次注入不重复正文、缺桥超时不执行。该测试不是实际 Chrome 注册证据。

## 主流程证据对照

| 主流程 | 已完成的自动检查 | 真实扩展状态 |
|---|---|---|
| 准确授权、拒绝不改内容 | 主机规则、permission 拒绝、UI 夹具 | 2026-10-14 用户确认手动清单第 2 节通过 |
| 不点图标新开页运行、其他主机不运行 | 启动门禁拒绝其他主机/子域；runner 握手 | 2026-10-14 用户确认第 2 节通过；其他子域/协议专项仍待补 |
| 同站两脚本共桥、独立启停 | adapter + 仓储集成测试 | 待真实页面 |
| A→B→恢复 A，草稿不改 A | 协调集成测试；computer use 注册标识/哈希 | 2026-10-14 用户确认手动清单第 3 部分通过；实际 getScripts 导出未附 |
| 持续 GM、多标签、null/delete、旧 lease | runner + 事务/lease 集成测试 | 待 Chrome 定时写入及刷新读取 |
| 关闭/删除/撤权，失败清理可重试 | 故障注入；UI 夹具关闭清理失败/重试 | 待真实 Chrome |
| SW/浏览器/更新恢复 | 新建协调器读取 pending 与 committed 的测试 | 2026-10-14 用户确认手动清单第 4、5 部分通过；精确中断及扩展版本更新专项仍待补 |
| 伪造来源/文档/管理消息/超量拒绝 | 来源、grant、版本、lease、大小校验测试 | 待真实 MAIN/ISOLATED 对抗验证 |

## 九行故障断点

| 断点 | 自动检查结果 | 真实中断证据 |
|---|---|---|
| PREPARED 之前失败 | 注入事务 abort；A 不变、Chrome 未触碰 | 待补 |
| 日志已写、update 前 | pending/candidate 样本重启后以 A 回补 | 待实际该点停止 SW |
| candidate 注册、DB 前 | candidate/A 新启动均被 pending 门禁拒绝；重启回补 A | 待实际该点停止 SW |
| Chrome update 失败 | A/current/previous 不变，B 草稿保留 | 待真实 API 失败 |
| Chrome 成功、DB 失败 | 回补 A 成功解除 pending；回补失败保持 unavailable | 待真实进程/存储故障 |
| DB 成功、响应丢失 | 同 opId 返回 B，不重复轮换；恢复替换注册 | 待真实断连 |
| 关闭后 unregister 失败 | desired=false，旧启动拒绝，状态 cleanup_required | 待真实 API 失败 |
| tombstone 后清理失败 | 不启动、不复活，重启清理关联数据 | 待实际该点停止 SW |
| 权限撤销/用户脚本 API 失败 | unavailable、保留内容、旧 lease 拒绝、重试恢复 | 待真实授权变化 |

## Computer use 记录

环境：既有 Chrome 155；`http://localhost:18888/p4-browser.html`。正式 App、VersionService、AutoRuntime 与 IndexedDB 仓储；Chrome API、模型、试运行结果为明确标注的替身，不调用真实扩展、不使用真实 Key。

1. 打开已有工具，取消模拟授权后点击开启：提示拒绝，工具保留，自动运行关闭。
2. 授权并开启：模拟注册为一条脚本、一座 `shop.example.com` 桥。
3. 手改 B、确认试运行、保存：注册 versionId/hash 替换为 B。
4. 恢复上一版：注册 versionId/hash 回到 A。
5. 模拟清理失败并关闭：后台先关闭许可，UI 显示“已关闭，注册清理失败”。
6. 解除故障并重试：注册列表和桥列表均为空，状态关闭。

归档的 [A 注册](./evidence/p4-browser-registry-A.json)、[B 注册](./evidence/p4-browser-registry-B.json)、[恢复 A 注册](./evidence/p4-browser-registry-restored.json) 来自夹具可见结果；versionId/hash 对照可追踪，不是正式扩展 getScripts 导出。[成功截图](./evidence/p4-browser.png)、[清理失败提示](./evidence/p4-browser-cleanup.png)。

复现：`luban/` 下运行 `node tests/p2/build-browser-probe.mjs`，HTTP 服务打开 `spike-v2/p4-browser.html`。夹具开关不会进入生产 dist。

## 运行边界

- MAIN 与宿主页共享世界，身份/lease 不向同源恶意页面保密。门禁依赖浏览器提供的 sender/document 和已提交版本，不把 token 当作绝对隔离。桥不提供管理操作、Key、设置或通用网络代理。
- 桥限制每秒 80 条、8 条并发、32 KiB 消息；后台二次限制每文档每秒 120 条、32 KiB，GM key 最长 500 字。runner 最多保留 128 条待确认写入，超限报告警告。
- lease 持久保存，24 小时有效，最多 2000 个活跃 lease；过期需刷新页面重新取得许可。GM_getValue 在当前文档使用启动快照和本地更新，其他标签的新值在刷新后的新启动读取；写入冲突按后台提交顺序。
- 无法中止已经执行的任意页面正文或撤销旧事件监听；关闭/删除/更新/恢复后提示刷新。未知 callback 错误不能全部自动捕获，正文和 GM 回执错误可记录。
- 本次未操作用户真实扩展的权限/注册，也未删除用户正式数据。Chrome 138、真实 1 MiB 对话/40 MiB 总量及大数据写入性能仍按原决策留到最终验收。

## 真实扩展验收入口

重新加载最新 `luban/dist` 后，在 Chrome 的 localhost 测试页创建、试运行并保存工具；点击“授权此网站并开启”。随后新开 localhost 页面且不点扩展图标，检查正文效果；127.0.0.1 应无效果。继续验证同站第二工具、A/B 更新恢复、GM 定时写入刷新读取、关闭/删除/撤权，以及实际停止 SW、重载扩展和浏览器重启。每项记录实际页面结果、运行状态、版本标识及错误，不能沿用 P0/P3 人工通过代替 P4 验收。

## 2026-10-14 生命周期人工验收更新

用户明确确认手动清单第 4 部分“实际停止并唤醒 SW”、第 5 部分“重载扩展与完全重启 Chrome”均已完成、符合预期。记录为这两部分的人工验收通过；未附逐项日志或截图，不改写成 computer use 自动验证。此确认不覆盖第 3、6 部分，也不代表第 7 部分的精确故障断点已经命中或通过。

## 2026-10-14 版本与草稿隔离人工验收更新

用户进一步确认第 3 部分“更新、恢复及未保存草稿隔离”已完成，按该部分整体人工验收通过记录：保存 B 后新页面使用 B，恢复后使用 A，未保存 C 不替换自动运行的 A。未附逐项截图或日志，不改写为工具自动验收。至此手动清单第 2、3、4、5 部分已获用户确认，第 6 部分及第 7 部分精确故障断点仍待验收。

## 2026-10-14 测试工具准备人工验收更新

用户确认手动清单第 1 部分“准备容易识别的测试工具 A”验收 OK，记录为人工通过。至此第 1–5 部分均已获用户确认；第 6 部分及第 7 部分精确故障断点仍待验收。

## 2026-10-14 精确故障断点人工验收更新

用户确认手动清单第 7 部分“精确故障断点：需要开发调试配合”符合预期，记录为本部分整体人工验收通过。未提供逐断点日志、截图或中断位置记录，不将该确认改写成 computer use 自动中断验证，也不虚构逐项运行数据。前述矩阵保留当时证据状态，当前本节人工结论以此更新为准；逐项证据仍待归档。至此手动清单第 1–5、7 部分获用户确认，第 6 部分仍待验收，P4 暂不标全量退出。

## 2026-10-14 人工清单完成确认

用户确认第 6 部分也验证通过。至此第 1–7 部分人工清单全部获用户确认，允许进入 P5。逐断点证据仍待归档，同站多工具及持续 GM 等清单未逐项覆盖的 P4 专项不据此虚构通过，留到 P6 综合验收。
