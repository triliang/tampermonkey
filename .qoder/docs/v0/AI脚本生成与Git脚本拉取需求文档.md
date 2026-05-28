# Tampermonkey AI 脚本生成与 Git 脚本拉取功能需求文档

## 1. 概述

本文档描述 Tampermonkey 浏览器扩展的两项新增功能需求：

1. **AI 脚本生成**：在网页上通过浮动面板，结合 AI 能力按用户诉求自动生成用户脚本（userscript）。
2. **Git 脚本拉取**：从 GitHub、GitLab、Gitea 等 Git 仓库中拉取 `.user.js` 脚本文件并安装。

---

## 2. AI 脚本生成功能

### 2.1 功能目标

用户在任意网页上，通过 Tampermonkey 提供的浮动面板，用自然语言描述想要实现的页面功能，AI 根据当前页面上下文自动生成符合用户脚本规范的代码，用户可一键安装或编辑后安装。

### 2.2 AI 服务商支持

支持多服务商接入，用户可在设置中切换：

| 服务商 | API 端点 | 认证方式 | 默认模型 |
|--------|---------|---------|---------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | Bearer Token | gpt-4o |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | Bearer Token | gemini-2.0-flash |
| Claude | `https://api.anthropic.com/v1/messages` | x-api-key + anthropic-version | claude-sonnet-4-20250514 |
| 自定义 | 用户填写 | Bearer Token | 用户填写 |

**说明**：
- OpenAI 和 Gemini 均采用 OpenAI 兼容的 Chat Completions 接口格式
- Claude 采用 Anthropic Messages API 格式，需单独适配请求/响应结构
- 自定义端点支持任何 OpenAI 兼容的 API（如 Ollama、vLLM、LocalAI 等本地部署方案）

### 2.3 浮动面板（页面侧 UI）

#### 2.3.1 面板形态

- **收起状态**：页面右下角固定显示一个 Tampermonkey 图标按钮（约 40x40px），不遮挡页面主要内容
- **展开状态**：点击按钮后展开为聊天式面板，宽度约 380px，高度约 500px，可拖拽移动

#### 2.3.2 面板功能区域

```
+------------------------------------------+
|  Tampermonkey AI 助手              [×]  |
+------------------------------------------+
|                                          |
|  [代码预览区域 - 语法高亮显示]            |
|                                          |
+------------------------------------------+
|  [描述你的需求...]                       |
|                                          |
+------------------------------------------+
|  [生成]  [安装]  [编辑]  [清除]          |
+------------------------------------------+
```

- **输入区**：多行文本框，用于输入自然语言需求描述
- **生成按钮**：将用户输入 + 页面上下文发送给 AI，生成用户脚本代码
- **代码预览区**：展示 AI 生成的脚本代码，支持基本语法高亮
- **安装按钮**：将生成的脚本直接安装到 Tampermonkey
- **编辑按钮**：打开 Tampermonkey 选项页的编辑器，加载生成的代码供用户修改
- **清除按钮**：清空输入区和预览区

#### 2.3.3 页面上下文采集

生成脚本时，自动采集以下上下文信息供 AI 参考：

- 当前页面 URL（用于自动生成 `@match` 规则）
- 当前页面标题（辅助理解页面用途）
- 用户选中的页面元素信息（如有选中，提供标签名、class、id 等）
- 页面域名

#### 2.3.4 AI 系统提示词

AI 生成脚本时，系统提示词（System Prompt）应包含：

- 要求输出标准用户脚本格式，包含 `==UserScript==` 元数据头
- 自动填充 `@name`、`@namespace`、`@match`、`@grant` 等必要元数据
- 指导 AI 使用 GM_* API 实现功能（如 `GM_setValue`、`GM_xmlhttpRequest` 等）
- 指导 AI 注意脚本安全性，避免危险操作

### 2.4 AI 配置管理

#### 2.4.1 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| provider | string | "openai" | 当前服务商（openai/gemini/claude/custom） |
| apiEndpoint | string | （按服务商） | API 端点 URL |
| apiKey | string | "" | API 密钥 |
| model | string | （按服务商） | 模型名称 |
| enabled | boolean | false | 是否启用 AI 面板功能 |
| maxTokens | number | 4096 | 最大生成 token 数 |
| temperature | number | 0.7 | 生成温度 |

#### 2.4.2 配置存储

- 所有配置通过 Tampermonkey 现有的 `TM_storage` 系统持久化
- API Key 以加密形式存储，界面显示时掩码处理
- 切换服务商时，自动填充对应的端点和默认模型

#### 2.4.3 连接测试

提供"测试连接"按钮，发送简单请求验证 API 可用性：
- 成功：显示"连接成功"提示
- 失败：显示具体错误信息（如认证失败、网络错误等）

### 2.5 选项页 AI 设置标签页

在 Tampermonkey 选项页新增"AI 助手"标签页，包含：

- 服务商选择下拉框（OpenAI / Gemini / Claude / 自定义）
- API 端点输入框（选择服务商后自动填充，自定义时可编辑）
- API 密钥输入框（密码类型）
- 模型名称输入框（选择服务商后自动填充默认模型）
- 最大 Token 数输入框
- 温度参数输入框
- 启用/禁用 AI 面板开关
- 测试连接按钮
- 保存按钮

---

## 3. Git 脚本拉取功能

### 3.1 功能目标

用户可以将 Git 仓库添加为脚本来源，浏览仓库中的 `.user.js` 文件列表，一键拉取并安装到 Tampermonkey。

### 3.2 支持的 Git 平台

| 平台 | 仓库树 API | 原始文件 URL 模式 |
|------|-----------|-------------------|
| GitHub | `https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1` | `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}` |
| GitLab | `https://gitlab.com/api/v4/projects/{id}/repository/tree?ref={branch}&recursive=true` | `https://gitlab.com/{owner}/{repo}/-/raw/{branch}/{path}` |
| Gitea | `https://{host}/api/v1/repos/{owner}/{repo}/git/trees/{branch}?recursive=true` | `https://{host}/{owner}/{repo}/raw/{branch}/{path}` |

**说明**：
- 系统根据用户输入的仓库 URL 自动识别平台类型
- 支持自部署的 GitLab / Gitea 实例（非 gitlab.com / gitea.com 域名）
- 分支默认为 `main`，用户可手动指定

### 3.3 仓库管理

#### 3.3.1 添加仓库

用户通过选项页的"Git 脚本"标签页添加仓库：

1. 输入仓库 URL（如 `https://github.com/user/my-scripts`）
2. 系统自动识别平台和仓库信息
3. 可选指定分支（默认 main）
4. 点击"添加"保存到仓库列表

#### 3.3.2 仓库列表

已添加的仓库以列表形式展示，每个仓库项包含：

- 仓库名称 / URL
- 平台图标标识
- "刷新"按钮：重新获取仓库中的脚本列表
- "移除"按钮：从仓库列表中删除
- 展开区域：显示仓库中的 `.user.js` 文件列表

#### 3.3.3 脚本列表

展开仓库后，显示该仓库中所有 `.user.js` 文件：

- 文件名
- 文件路径
- "安装"按钮：下载并安装该脚本
- "查看源码"按钮：下载后在编辑器中打开（不直接安装）
- 已安装标识：若该脚本已安装则显示标记

#### 3.3.4 批量操作

- "全部安装"按钮：一键安装仓库中所有脚本
- "检查更新"按钮：对比已安装脚本的版本与仓库中的版本

### 3.4 脚本拉取与安装流程

```
用户点击"安装"
    → 通过平台 API 获取文件的 raw URL
    → 使用 xmlhttpRequest 下载脚本源码
    → 使用 scriptParser.createScriptFromSrc() 解析验证
    → 调用现有 saveScript 流程安装脚本
    → 显示安装结果（成功/失败）
```

**说明**：
- 所有网络请求通过 background.js 执行，利用 Chrome 扩展的跨域权限
- 脚本验证复用现有的 `scriptParser` 模块，确保格式合法
- 安装流程复用现有的 `saveScript` / `addNewUserScript` 机制

### 3.5 仓库数据持久化

- 仓库列表存储在 `TM_storage` 中
- 每个仓库记录包含：URL、平台类型、分支、最后刷新时间、脚本列表缓存
- 脚本列表缓存避免每次展开都需要网络请求

### 3.6 选项页 Git 脚本标签页

在 Tampermonkey 选项页新增"Git 脚本"标签页，包含：

- 添加仓库表单
  - 仓库 URL 输入框
  - 分支输入框（默认 main，自动填充）
  - "添加"按钮
- 已添加仓库列表
  - 每个仓库可展开/折叠
  - 展开后显示脚本列表及操作按钮
- 状态指示
  - 加载中：显示加载动画
  - 错误：显示错误信息（如仓库不存在、网络错误）
  - 成功：显示脚本数量

### 3.7 浏览器动作菜单集成

在 Tampermonkey 浏览器动作弹窗（action.html）中添加：

- "从 Git 拉取"菜单项
- 点击后打开选项页的"Git 脚本"标签页

---

## 4. 架构设计

### 4.1 新增模块

| 模块 | 文件 | 注册名 | 职责 |
|------|------|--------|------|
| AI 服务商模块 | `src/ai-provider.js` | `ai-provider` | AI 配置管理、API 调用、响应解析 |
| AI 浮动面板 | `src/ai-panel.js` + `src/ai-panel.css` | — | 页面侧浮动面板 UI 及交互逻辑 |
| Git 拉取模块 | `src/git-puller.js` | `git-puller` | 仓库 URL 解析、平台 API 调用、脚本下载 |

### 4.2 现有模块修改

| 模块 | 文件 | 修改内容 |
|------|------|---------|
| 后台脚本 | `src/background.js` | 新增 `aiGenerate`、`aiSaveScript`、`aiIsConfigured`、`aiGetConfig`、`gitListScripts`、`gitFetchScript`、`gitAddRepo`、`gitRemoveRepo`、`gitGetRepos` 消息处理器 |
| 内容脚本 | `src/content.js` | 加载并注入 AI 浮动面板 |
| 选项页 | `src/options.js` + `src/options.html` | 新增"AI 助手"和"Git 脚本"标签页 |
| 浏览器动作 | `src/action.js` | 新增"从 Git 拉取"菜单项 |
| 后台页面 | `src/background.html` | 引入 `ai-provider.js`、`git-puller.js` |

### 4.3 数据流

#### AI 脚本生成数据流

```
页面浮动面板 → chrome.extension.sendMessage({method:"aiGenerate",...})
    → background.js 收到请求
    → ai-provider.chat() 调用 AI API
    → AI 返回脚本代码
    → background.js 返回代码给浮动面板
    → 浮动面板展示代码
    → 用户点击"安装"
    → chrome.extension.sendMessage({method:"aiSaveScript", code:"..."})
    → background.js 调用 scriptParser.createScriptFromSrc() 验证
    → 调用 addNewUserScript() 安装
    → 返回安装结果
```

#### Git 脚本拉取数据流

```
选项页 → chrome.extension.sendMessage({method:"gitListScripts", repoUrl:"..."})
    → background.js 收到请求
    → git-puller.listScripts() 调用平台 API
    → 返回 .user.js 文件列表给选项页
    → 用户点击"安装"
    → chrome.extension.sendMessage({method:"gitFetchScript", rawUrl:"..."})
    → background.js 下载脚本源码
    → scriptParser.createScriptFromSrc() 验证
    → addNewUserScript() 安装
    → 返回安装结果
```

### 4.4 安全考量

- AI API 密钥以掩码形式在界面显示，不以明文暴露
- AI 生成的脚本通过 `scriptParser` 验证后才允许安装
- Git 拉取的脚本同样经过 `scriptParser` 验证
- 所有外部网络请求通过 background.js 统一执行，利用扩展权限处理跨域
- AI 浮动面板注入页面时不影响页面原有功能，面板元素使用独立命名空间（`tm-ai-` 前缀）避免 CSS 冲突

---

## 5. 国际化

新增功能的界面文本需要支持国际化。涉及的新增消息键包括：

- AI 助手相关：`AI_Assistant`、`Generate_Script`、`Install_Script`、`Edit_Script`、`AI_Provider`、`API_Key`、`Model`、`Test_Connection` 等
- Git 脚本相关：`Git_Scripts`、`Add_Repository`、`Pull_from_Git`、`Refresh`、`Install_All` 等

初始版本先支持英文（en）和简体中文（zh_CN），后续可扩展其他语言。

---

## 6. 实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | AI 服务商模块（ai-provider.js） | 核心基础，所有 AI 功能依赖此模块 |
| P0 | 后台脚本 AI 消息处理器 | AI 功能的通信枢纽 |
| P0 | AI 浮动面板 | 用户交互入口 |
| P1 | 选项页 AI 设置标签页 | 配置管理 |
| P1 | 内容脚本集成 | 面板注入 |
| P1 | Git 拉取模块（git-puller.js） | Git 功能核心 |
| P1 | 后台脚本 Git 消息处理器 | Git 功能通信 |
| P2 | 选项页 Git 脚本标签页 | Git 仓库管理 UI |
| P2 | 浏览器动作 Git 菜单 | 快捷入口 |
| P2 | 国际化支持 | 多语言 |
