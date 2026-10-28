# 一步打开侧栏后的 activeTab 授权回归

日期：2026-10-21。结论：已复现并修复；不恢复中间弹窗、不增加常驻网站权限。

## 原因

先前从popup入口改为sidePanel.setPanelBehavior({openPanelOnActionClick:true})，只验证了侧栏选项已设置，错误地把“侧栏显示”和“用户执行action获得activeTab”当作等价。页面查询依赖activeTab来获取tabs.Tab.url；内置侧栏切换未触发action事件，URL不可见，GET_CURRENT_SITE返回ACTIVE_TAB_EXPIRED。

Chrome官方规则：activeTab在用户执行action等明确操作时提供临时host权限，可访问URL并调用scripting.executeScript；跨来源导航或关闭后失效。[activeTab官方文档](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)。侧栏本身的显示不应作为网页访问授权凭证。[Chrome团队侧栏指南](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/skills-src/chrome-extensions/references/extensions/side-panel.md)。

此前Native/页面验收的临时扩展副本预授localhost host权限；它能验证后续取证/生成/运行保存，但掩盖了这个工具栏入口问题。先前“面板开关=true”配置检查不能代表完整工具栏授权验收。本次补齐不预授任何夹具host权限的回归。

## 实测

环境：一次性Chrome for Testing 151；使用原始dist，不增加localhost权限；Chrome浏览器级CDP Extensions.triggerAction，目标为实际tab target。不是在Worker里手工emit事件，也不伪造activeTab。

| 检查 | 原内置侧栏开关 | 修复后的显式action处理 |
|---|---|---|
| 起始网页host权限/URL | 无权限、URL不可见 | 无权限、URL不可见 |
| 触发action后监听器 | 0次 | 1次 |
| 触发后URL | 仍不可见 | 可读 |
| 实际scripting.executeScript | Chrome拒绝 | 可读取合成页面正文 |
| 生产GET_CURRENT_SITE路由 | RUN_ACTIVE_TAB_EXPIRED | 成功返回正确tab及URL |

[修复前原始结果](evidence/active-tab-before.json)、[修复后原始结果](evidence/active-tab-after.json)。修复后4项通过。前两次探针使用page级session或page target被Chrome拒绝，改用文档要求的浏览器级session/tab target后才记录有效复现；这些测试方法错误不算产品失败。

## 修复

1. action.default_popup保持移除，内置openPanelOnActionClick设为false。
2. 在chrome.action.onClicked中同步调用sidePanel.open({tabId})，不在open前await或查页面，不退回window级共享面板。
3. tab专属面板路径提前配置；工具栏打开不依赖容易在Service Worker重启后丢失的内存ready标记。
4. 页面已关闭单独报告PAGE_CLOSED；无URL保持授权不足提示；受限协议报告RESTRICTED_PAGE。
5. 侧栏显示实际页面查询错误，不再把所有原因统称为Chrome内部页限制；未发送内容保留。

[22项定向回归](evidence/active-tab-tests.txt)、[类型与构建](evidence/active-tab-build.txt)、[lint](evidence/active-tab-lint.txt)通过。同步适配旧UI测试对Thinking按钮/模型菜单的查询，未降低草稿/标签隔离断言。

复现：沿用第12份文档测试浏览器环境变量，运行`node luban/scripts/verify-v43-active-tab.mjs --before`复现旧方式；不带参数验证修复。--before仅在测试profile内切换浏览器选项。

## 边界

未修改用户日常浏览器；没有读取实际业务页面。用户需重载扩展，再在目标网页点击图标，获得新一次临时授权。Chrome内部页面、已关闭标签和跨来源后失效仍按实际原因处理。完整发布剩余清单保持不变。
