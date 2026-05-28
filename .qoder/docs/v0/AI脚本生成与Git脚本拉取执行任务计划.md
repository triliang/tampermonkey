# Tampermonkey AI 脚本生成与 Git 脚本拉取 — 执行任务计划

## 阶段一：AI 核心基础设施（P0）

> **目标**：建立 AI 模块的后端核心，使消息链路从 content script → background → AI API 打通，可独立通过浏览器控制台验证。

| 编号 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 1.1 | 创建 `src/ai-provider.js`：IIFE 封装 + Registry 注册；实现 `providerDefaults`、`buildSystemPrompt(context)`、`extractCodeFromResponse(text)` 三个基础函数 | `src/ai-provider.js`（新建） | 在 background 页控制台执行 `Registry.get('ai-provider')` 返回模块对象；`buildSystemPrompt({url:'https://example.com', domain:'example.com'})` 输出含 `@match` 规则的系统提示词 |
| 1.2 | 实现 `openaiCompatibleRequest()`：OpenAI / Gemini / 自定义端点的 Chat Completions 请求构建与响应解析 | `src/ai-provider.js` | 在 background 控制台调用 `aiProvider.chat(config, 'hello', null, cb)` 使用真实 OpenAI Key，收到含代码的回调 |
| 1.3 | 实现 `claudeRequest()`：Claude Messages API 适配（`x-api-key` 认证、system 顶层字段、`content[0].text` 响应解析） | `src/ai-provider.js` | 使用真实 Claude Key 调用，确认请求格式与响应解析正确 |
| 1.4 | 实现 `chat()` 主入口与服务商路由 + `testConnection()` + `getProviderDefaults()` | `src/ai-provider.js` | `chat()` 按 provider 分发到正确适配器；`testConnection()` 返回连接成功/失败 |
| 1.5 | 在 `src/background.html` 添加 `<script src="ai-provider.js"></script>` | `src/background.html` | 重新加载扩展，控制台无脚本加载错误 |
| 1.6 | 在 `src/background.js` 添加 `Registry.require('ai-provider')` 声明 | `src/background.js` | 扩展加载正常，`Registry.get('ai-provider')` 可用 |
| 1.7 | 在 `src/background.js` 的 `defaults` 对象中添加 `ai_enabled`、`ai_provider`、`ai_maxTokens`、`ai_temperature` 默认值 | `src/background.js` | `Config.values.ai_enabled` 返回 `false` |
| 1.8 | 在 `src/background.js` 实现 `getAIConfig()` 和 `maskApiKey()` 辅助函数 | `src/background.js` | `getAIConfig()` 返回含默认值的配置对象；`maskApiKey('sk-1234567890abcd')` 返回 `'sk-1****abcd'` |
| 1.9 | 在 `src/background.js` 的 `requestHandling` 中注册 7 个 AI 消息处理器：`aiGenerate`、`aiSaveScript`、`aiEditScript`、`aiIsConfigured`、`aiGetConfig`、`aiSaveConfig`、`aiTestConnection` | `src/background.js` | 在 options 页控制台发送 `chrome.extension.sendMessage({method:'aiIsConfigured'}, console.log)` 返回 `{enabled:false, configured:false}`；配置 API Key 后 `aiGenerate` 返回生成的脚本代码 |

**阶段一验证门**：

- 扩展加载无报错
- 所有 7 个 AI 消息处理器可通过 `chrome.extension.sendMessage` 正常调用
- 配置 OpenAI/Claude Key 后，`aiGenerate` 能返回合法的 userscript 代码
- `aiSaveScript` 能将 AI 生成的代码解析并通过 `scriptParser.createScriptFromSrc()` 安装

---

## 阶段二：AI 前端界面（P0+P1）

> **目标**：实现页面浮动面板和选项页 AI 设置，形成"自然语言 → 生成 → 安装"完整闭环，可通过浏览器 UI 端到端验证。

| 编号 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 2.1 | 创建 `src/ai-panel.css`：所有选择器 `.tm-ai-` 前缀 + `!important`，实现浮动按钮（收起态）、聊天面板（展开态）、头部拖拽区、代码预览区、输入区、操作按钮区、状态栏 | `src/ai-panel.css`（新建） | 注入到任意页面，面板正确渲染，缩放窗口不溢出，宿主页面样式不污染面板 |
| 2.2 | 创建 `src/ai-panel.js`：DOM 创建（toggle + panel）、显隐切换、拖拽移动、页面上下文采集（`collectContext` / `collectDomSummary` / `sanitizeContext` / `generateCssSelector` / `isAIPanelElement`）、事件绑定（Generate / Install / Edit / Clear）、Ctrl+Enter 快捷键 | `src/ai-panel.js`（新建） | 在页面中手动注入该脚本，面板可展开/收起/拖拽，输入需求点击 Generate 后代码预览区显示脚本 |
| 2.3 | 在 `src/content.js` 添加 `initAIPanel()` 和 `injectAIPanel()`：DOMContentLoaded 后发送 `aiIsConfigured` 消息，若启用则注入 CSS 和 JS | `src/content.js` | 启用 AI 面板后打开任意网页，右下角出现浮动按钮，点击展开面板 |
| 2.4 | 在选项页 `src/options.html` 添加 `<script src="ai-provider.js"></script>` | `src/options.html` | 页面加载无报错 |
| 2.5 | 在 `src/options.js` 新增"AI 助手"标签页：服务商下拉框（OpenAI/Gemini/Claude/自定义）、API 端点输入框、API Key 密码框、Model 输入框、Max Tokens / Temperature 数字框、启用 AI 面板复选框、Test Connection / Save 按钮、连接状态显示；服务商切换自动填充默认值 | `src/options.js` | 打开选项页可见"AI 助手"标签页，切换服务商自动填充端点和模型，点击 Test Connection 显示结果，Save 后配置持久化 |
| 2.6 | 在 `manifest.json`（`build_sys/manifest.json.google.com` 和 `manifest.json.legacy.com`）添加 `web_accessible_resources` 条目：`ai-panel.js`、`ai-panel.css`、`icon.png` | `build_sys/manifest.json.*` | 重新打包扩展，content script 能正常注入面板资源 |

**阶段二验证门**：

- 选项页 AI 设置可正常保存/读取，API Key 掩码显示
- 启用 AI 面板后，任意页面右下角出现浮动按钮
- 面板内输入需求 → 点击 Generate → 代码预览区显示合法 userscript → 点击 Install → 选项页脚本列表中出现新脚本
- 面板可拖拽移动，不遮挡宿主页面交互
- 禁用 AI 面板后，页面不注入浮动按钮

---

## 阶段三：Git 核心功能（P1）

> **目标**：实现 Git 仓库脚本拉取完整闭环，从添加仓库到浏览/安装脚本，可在选项页 UI 端到端验证。

| 编号 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 3.1 | 创建 `src/git-puller.js`：IIFE 封装 + Registry 注册；实现 `parseRepoUrl()` 支持 GitHub / GitLab(公共+自部署) / Gitea URL 识别 | `src/git-puller.js`（新建） | 在 background 控制台 `gitPuller.parseRepoUrl('https://github.com/user/repo')` 返回 `{platform:'github', owner:'user', repo:'repo'}` |
| 3.2 | 实现 GitHub 适配：`githubListScripts()` 调用 Tree API、过滤 `.user.js` 文件 | `src/git-puller.js` | 调用 `gitPuller.listScripts({platform:'github', owner:'...', repo:'...'}, cb)` 返回脚本文件列表 |
| 3.3 | 实现 GitLab 适配：`gitlabListScripts()` 调用 GitLab Tree API（含 project ID URL 编码） | `src/git-puller.js` | 调用 GitLab 公共仓库的 `listScripts` 返回文件列表 |
| 3.4 | 实现 Gitea 适配：`giteaListScripts()` 调用 Gitea Tree API | `src/git-puller.js` | 调用 Gitea 实例的 `listScripts` 返回文件列表 |
| 3.5 | 实现 `detectPlatform()` 自动探测 + `buildRawUrl()` Raw URL 构建 + `fetchScript()` 脚本下载 | `src/git-puller.js` | `detectPlatform` 对未知 URL 自动探测平台；`buildRawUrl` 对三平台返回正确的 Raw URL；`fetchScript` 下载脚本内容 |
| 3.6 | 在 `src/background.html` 添加 `<script src="git-puller.js"></script>`；在 `src/background.js` 添加 `Registry.require('git-puller')` | `src/background.html`、`src/background.js` | 扩展加载正常，`Registry.get('git-puller')` 可用 |
| 3.7 | 在 `src/background.js` 的 `requestHandling` 中注册 5 个 Git 消息处理器：`gitListScripts`、`gitFetchScript`、`gitAddRepo`、`gitRemoveRepo`、`gitGetRepos` | `src/background.js` | 发送 `gitAddRepo` 添加仓库 → `gitListScripts` 返回脚本列表 → `gitFetchScript` 下载安装脚本 → `gitRemoveRepo` 移除仓库 |
| 3.8 | 在 `src/options.html` 添加 `<script src="git-puller.js"></script>` | `src/options.html` | 页面加载无报错 |
| 3.9 | 在 `src/options.js` 新增"Git 脚本"标签页：添加仓库表单（URL + Branch）、仓库列表（展开/折叠）、每个仓库显示脚本文件列表（Install / View Source 按钮）、Refresh / Remove 操作、Install All / Check Updates 批量操作 | `src/options.js` | 添加 GitHub 仓库 → 展开看到 `.user.js` 文件列表 → 点击 Install 安装成功 → 仓库持久化到 TM_storage |

**阶段三验证门**：

- 选项页"Git 脚本"标签页可正常添加/移除 GitHub 仓库
- 展开 GitHub 仓库显示 `.user.js` 文件列表
- 点击 Install 单个安装成功，选项页脚本列表更新
- 点击 Install All 批量安装成功
- 关闭重开选项页，仓库列表持久化存在
- GitLab / Gitea 仓库同样可正常使用

---

## 阶段四：集成收尾与国际化（P2）

> **目标**：补全 action.js 快捷入口、i18n 国际化、style.css 统一样式，确保整体功能完整。

| 编号 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 4.1 | 在 `src/action.js` 的 `createActionsMenu` 中添加"从 Git 拉取"菜单项（含分隔线），点击跳转 `options.html#git_scripts` | `src/action.js` | 点击浏览器扩展图标，弹出菜单底部出现"从 Git 拉取"项，点击跳转到选项页 Git 标签页 |
| 4.2 | 在 `i18n/en/messages.json` 添加 AI 相关 15 个消息键 + Git 相关 10 个消息键 | `i18n/en/messages.json` | 选项页和面板切换英文语言，所有新增文本正确显示 |
| 4.3 | 在 `i18n/zh_CN/messages.json` 添加对应简体中文消息键 | `i18n/zh_CN/messages.json` | 切换中文语言，所有文本正确显示 |
| 4.4 | 在 `src/style.css` 添加 AI 设置标签页和 Git 脚本标签页的选项页样式（表单布局、按钮样式、仓库列表样式、状态提示样式） | `src/style.css` | 选项页 AI 标签页和 Git 标签页样式统一美观，与其他标签页风格一致 |
| 4.5 | 端到端回归测试：AI 完整流程（配置 → 浮动面板 → 生成 → 安装/编辑）+ Git 完整流程（添加仓库 → 浏览 → 安装 → 更新）+ 两个模块互不干扰 | 全部 | 核心用户场景无报错，功能正常 |

**阶段四验证门**：

- 浏览器动作菜单含"从 Git 拉取"入口且跳转正确
- 中英文国际化完整，无遗漏键
- AI 和 Git 两个模块功能互不干扰，可同时使用
- 整体无 JS 报错，无样式错乱

---

## 文件变更总览

| 操作 | 文件 | 阶段 |
|------|------|------|
| **新建** | `src/ai-provider.js` | 一 |
| **新建** | `src/ai-panel.css` | 二 |
| **新建** | `src/ai-panel.js` | 二 |
| **新建** | `src/git-puller.js` | 三 |
| **修改** | `src/background.html` | 一、三 |
| **修改** | `src/background.js` | 一、三 |
| **修改** | `src/content.js` | 二 |
| **修改** | `src/options.html` | 二、三 |
| **修改** | `src/options.js` | 二、三 |
| **修改** | `src/action.js` | 四 |
| **修改** | `src/style.css` | 四 |
| **修改** | `i18n/en/messages.json` | 四 |
| **修改** | `i18n/zh_CN/messages.json` | 四 |
| **修改** | `build_sys/manifest.json.*` | 二 |

---

## 关键依赖关系

```
阶段一（AI 后端） ──→ 阶段二（AI 前端） ──→ 阶段四（收尾）
                                              ↑
阶段三（Git 全栈） ───────────────────────────┘

阶段一与阶段三无依赖关系，可并行执行
阶段二依赖阶段一（消息处理器必须先就绪）
阶段四依赖阶段二和阶段三（所有 UI 就绪后统一收尾）
```
