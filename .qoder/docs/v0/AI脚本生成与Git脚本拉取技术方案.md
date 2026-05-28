# Tampermonkey AI 脚本生成与 Git 脚本拉取 — 技术方案

## 1. 现有架构分析

### 1.1 核心模块与通信机制

Tampermonkey 采用 Chrome Extension Manifest V1/V2 混合架构，核心模块间通信依赖 `chrome.extension.onMessage` / `chrome.extension.sendMessage` 消息机制。

**消息处理流程**（[background.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/background.js#L4496-L4541)）：

```
发送方 → chrome.extension.sendMessage({method: "xxx", ...})
  → background.js requestHandling.handler() 分发
  → requestHandling[request.method].exec(request, sender, sendResponse)
  → 结果通过 sendResponse 返回
```

**权限控制**：每个消息处理器声明 `allow` 字段，控制调用来源：

- `insecure`：任意来源
- `extpage`：扩展内部页面（options、action 等）
- `script`：内容脚本注入的页面
- `options`：仅选项页

### 1.2 模块注册系统

[registry.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/registry.js) 实现依赖注入：

```js
Registry.require('xmlhttprequest');  // 声明依赖，自动加载 .js 文件
var xmlhttpRequestHelper = Registry.get('xmlhttprequest');  // 获取模块实例
Registry.register('parser', scriptParser);  // 注册模块
```

新增模块需遵循此模式：IIFE 封装 → `Registry.require()` 声明依赖 → `Registry.register()` 注册。

### 1.3 配置与存储

- **ConfigObject**（[background.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/background.js#L2359)）：全局配置管理，`defaults` 定义默认值，通过 `Config.values.xxx` 读写，变更自动触发 `changeListeners`
- **TM_storage**（[background.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/background.js#L1705)）：持久化存储层，底层使用 Web SQL Database（`openDatabase`）或 `localStorage` 降级，API 为 `setValue(name, value, cb)` / `getValue(name, defaultValue)`

### 1.4 脚本解析与安装

- **scriptParser**（[parser.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/parser.js#L72)）：核心解析模块
  - `createScriptFromSrc(src)`：解析脚本源码 → 返回 `Script` 对象（含元数据、textContent 等）
  - `processHeader(header)`：解析 `==UserScript==` 头部标签
  - `getHeader(src)`：提取头部文本
- **addNewUserScript**（[background.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/background.js#L2925)）：脚本安装入口，参数结构 `{ tabid, url, src, ask, clean, save, cb }`
- **installFromUrl**（[background.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/background.js#L3197)）：从 URL 下载并安装脚本

### 1.5 网络请求

[xmlhttprequest.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/xmlhttprequest.js#L17) 封装了 `XMLHttpRequest`，支持重试机制。在 background 上下文中可直接发起跨域请求。

### 1.6 UI 框架

- **选项页**：`options.js` 使用 `TabView`（[tabview.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/tabview.js)）构建标签页 UI，`crcrc.js` 提供 DOM 创建辅助函数 `cr()` / `crc()`
- **浏览器动作**：`action.js` 构建 popup 菜单项
- **样式**：`style.css` 全局样式，`cm/codemirror.css` 编辑器样式

### 1.7 国际化

[i18n.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/i18n.js) 封装 `chrome.i18n.getMessage()`，消息定义在 `i18n/{locale}/messages.json`。

---

## 2. 新增模块详细设计

本章将新增功能划分为两大独立模块：**AI 模块**和 **Git 模块**。两大模块在架构上完全解耦，各自拥有独立的子组件、数据流和消息协议，仅在脚本安装环节复用现有的 `scriptParser` + `addNewUserScript` 流程。

---

## 2.1 AI 模块

### 2.1.1 模块总览

AI 模块负责实现“自然语言描述 → AI 生成用户脚本 → 一键安装/编辑”的完整闭环。由以下子组件构成：

| 子组件 | 文件 | 运行上下文 | 职责 |
|--------|------|-----------|------|
| AI 服务商适配器 | `src/ai-provider.js` | Background | 多服务商 API 调用、响应解析、系统提示词构建 |
| AI 浮动面板 | `src/ai-panel.js` + `src/ai-panel.css` | Content Script (页面 DOM) | 页面侧聊天式 UI、用户交互 |
| 页面上下文资源管理 | — (集成在 ai-panel.js) | Content Script (页面 DOM) | 采集页面 URL/结构/选中元素/DOM 摘要，安全过滤，构建 AI 上下文 |
| AI 配置管理 | — (集成在 background.js) | Background | 配置 CRUD、持久化、掩码处理 |
| AI 设置标签页 | — (集成在 options.js) | Extension Page | 选项页 AI 配置界面 |
| AI 消息处理器 | — (集成在 background.js) | Background | 消息路由、权限控制、流程编排 |

**模块架构图**：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         页面上下文 (Web Page)                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    AI 浮动面板 (ai-panel.js)                  │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌────────────────────────┐   │   │
│  │  │ 输入区    │ │ 代码预览区    │ │ 操作按钮(生成/安装/编辑) │   │   │
│  │  └──────────┘ └──────────────┘ └────────────────────────┘   │   │
│  │                     ↕ chrome.extension.sendMessage           │   │
│  │              上下文采集 (URL/标题/选中元素)                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              ↕ 消息通道
┌─────────────────────────────────────────────────────────────────────┐
│                    Background (background.js)                        │
│  ┌───────────────────┐  ┌──────────────────────────────────────┐  │
│  │ AI 消息处理器      │  │ AI 服务商适配器 (ai-provider.js)      │  │
│  │ aiGenerate        │→ │  ┌─────────┐ ┌─────────┐ ┌────────┐ │  │
│  │ aiSaveScript      │  │  │ OpenAI  │ │ Gemini  │ │ Claude │ │  │
│  │ aiEditScript      │  │  │ Compat  │ │ Compat  │ │ Native │ │  │
│  │ aiIsConfigured    │  │  └────┬────┘ └────┬────┘ └───┬────┘ │  │
│  │ aiGetConfig       │  │       └──────────┼──────────┘       │  │
│  │ aiSaveConfig      │  │              统一出口                 │  │
│  │ aiTestConnection  │  │         extractCodeFromResponse      │  │
│  └───────────────────┘  └──────────────────────────────────────┘  │
│  ┌───────────────────┐  ┌──────────────────────────────────────┐  │
│  │ AI 配置管理        │  │ TM_storage                          │  │
│  │ getAIConfig()     │→ │  TM_ai_config (持久化)                │  │
│  │ saveAIConfig()    │  │  TM_ai_edit_code (临时)               │  │
│  └───────────────────┘  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↕ HTTPS
                    ┌──────────────────────┐
                    │   AI 服务商 API       │
                    │  OpenAI / Gemini /    │
                    │  Claude / Custom      │
                    └──────────────────────┘
```

#### 页面上下文资源管理

AI 生成脚本的质量高度依赖于提供给 AI 的页面上下文信息。上下文采集发生在浮动面板（`ai-panel.js`）侧，在用户点击"生成"时自动执行，随消息一起发送给 background，最终注入 AI 系统提示词。

**上下文数据结构**：

```js
var pageContext = {
    // === 基础信息 ===
    url: "https://example.com/page?param=1",   // 当前页面完整 URL
    title: "Example Page Title",                // 页面 <title>
    domain: "example.com",                      // 当前域名
    protocol: "https:",                         // 协议 (http/https)

    // === 页面结构信息 ===
    contentType: "text/html",                   // document.contentType
    charset: "UTF-8",                           // document.characterSet
    bodyClass: "page-home logged-in",           // <body> 的 class
    bodyId: "page-main",                        // <body> 的 id
    metaDescription: "Page description...",     // <meta name="description">
    canonicalUrl: "https://example.com/page",   // <link rel="canonical">

    // === 选中元素信息（用户选中时采集）===
    selectedElement: {
        tagName: "DIV",                         // 元素标签名
        id: "content-area",                     // 元素 id
        className: "main-content sidebar",      // 元素 class
        attributes: {                            // 关键属性
            "data-role": "article",
            "role": "main"
        },
        innerText: "Selected text content...",   // 选中元素的文本（截断至500字符）
        parentInfo: {                            // 父元素概要
            tagName: "MAIN",
            id: "main-wrapper",
            className: ""
        },
        cssSelector: "#content-area.main-content" // 自动生成的 CSS 选择器
    },

    // === 页面 DOM 摘要（轻量级结构概览）===
    domSummary: {
        forms: 2,                                // <form> 数量
        inputs: [                                // <input> 概要
            { type: "text", name: "search", id: "search-box" },
            { type: "submit", name: "", id: "" }
        ],
        buttons: [                              // <button> 概要
            { text: "Submit", id: "submit-btn", className: "btn-primary" }
        ],
        iframes: 1,                             // <iframe> 数量
        scripts: 15,                            // <script> 数量（外部）
        links: 42                               // <a> 数量
    }
};
```

**采集流程**：

```
用户点击“生成”
    │
    ▼
collectContext() 在 ai-panel.js 中执行
    │
    ├── 1. 基础信息采集
    │   └── window.location / document.title / document.characterSet
    │
    ├── 2. 选中元素采集
    │   ├── window.getSelection() 获取选区
    │   ├── 排除 tm-ai- 前缀元素（避免采集面板自身）
    │   ├── 提取 tagName / id / className / 关键 attributes
    │   ├── 截断 innerText 至 500 字符（控制 token 消耗）
    │   └── 自动生成 CSS 选择器（辅助 AI 精确定位元素）
    │
    ├── 3. DOM 摘要采集
    │   ├── 统计表单/输入框/按钮数量
    │   └── 提取可交互元素概要（name/id/type）
    │
    ├── 4. 页面元数据采集
    │   ├── <meta name="description"> 内容
    │   ├── <link rel="canonical"> URL
    │   └── <body> 的 class/id
    │
    └── 5. 安全过滤
        ├── 移除可能包含敏感信息的 cookie 值
        ├── 脱敏 URL 中的 token/session 参数
        └── 截断所有文本字段至合理长度
    │
    ▼
chrome.extension.sendMessage({
    method: 'aiGenerate',
    prompt: "...",
    context: pageContext     ← 上下文随消息发送
})
    │
    ▼
background.js → aiProvider.chat(config, prompt, context, cb)
    │
    ▼
buildSystemPrompt(context) ← 上下文注入系统提示词
```

**上下文采集详细实现**：

```js
var collectContext = function() {
    var context = {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        protocol: window.location.protocol
    };

    // --- 页面元数据 ---
    context.charset = document.characterSet || '';
    context.bodyClass = document.body ? document.body.className : '';
    context.bodyId = document.body ? document.body.id : '';

    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) context.metaDescription = (metaDesc.content || '').substring(0, 200);

    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) context.canonicalUrl = canonical.href || '';

    // --- 选中元素 ---
    context.selectedElement = null;
    var selection = window.getSelection();
    if (selection && selection.anchorNode) {
        var elem = selection.anchorNode.nodeType === 3  // 文本节点取父元素
            ? selection.anchorNode.parentElement
            : selection.anchorNode;
        // 排除浮动面板自身
        if (elem && !isAIPanelElement(elem)) {
            context.selectedElement = {
                tagName: elem.tagName,
                id: elem.id || '',
                className: (elem.className || '').substring(0, 200),
                attributes: collectKeyAttributes(elem),
                innerText: (elem.innerText || '').substring(0, 500),
                parentInfo: elem.parentElement ? {
                    tagName: elem.parentElement.tagName,
                    id: elem.parentElement.id || '',
                    className: (elem.parentElement.className || '').substring(0, 100)
                } : null,
                cssSelector: generateCssSelector(elem)
            };
        }
    }

    // --- DOM 摘要 ---
    context.domSummary = collectDomSummary();

    // --- 安全过滤 ---
    context = sanitizeContext(context);

    return context;
};

// 判断是否为 AI 面板元素
var isAIPanelElement = function(elem) {
    var id = elem.id || '';
    var cls = elem.className || '';
    return id.indexOf('tm-ai-') === 0 || cls.indexOf('tm-ai-') !== -1;
};

// 提取关键属性（过滤事件处理和敏感属性）
var collectKeyAttributes = function(elem) {
    var attrs = {};
    var skipPattern = /^(on|data-ng|data-v-|style)/i;  // 跳过事件和框架属性
    var maxAttrs = 10;  // 最多采集10个属性
    var count = 0;
    if (elem.attributes) {
        for (var i = 0; i < elem.attributes.length && count < maxAttrs; i++) {
            var attr = elem.attributes[i];
            if (!skipPattern.test(attr.name) && attr.value) {
                attrs[attr.name] = attr.value.substring(0, 100);
                count++;
            }
        }
    }
    return attrs;
};

// 自动生成 CSS 选择器
var generateCssSelector = function(elem) {
    if (elem.id) return '#' + CSS.escape(elem.id);
    var parts = [];
    parts.push(elem.tagName.toLowerCase());
    if (elem.className) {
        var mainClass = elem.className.trim().split(/\s+/)[0];
        if (mainClass) parts.push('.' + CSS.escape(mainClass));
    }
    // 向上最多追溯2层
    if (elem.parentElement) {
        var parent = elem.parentElement;
        if (parent.id) {
            return '#' + CSS.escape(parent.id) + ' > ' + parts.join('');
        }
    }
    return parts.join('');
};

// DOM 摘要采集
var collectDomSummary = function() {
    var summary = {};
    summary.forms = document.forms ? document.forms.length : 0;

    summary.inputs = [];
    var inputs = document.querySelectorAll('input[type], select, textarea');
    for (var i = 0; i < Math.min(inputs.length, 20); i++) {
        var inp = inputs[i];
        summary.inputs.push({
            type: inp.type || inp.tagName.toLowerCase(),
            name: inp.name || '',
            id: inp.id || ''
        });
    }

    summary.buttons = [];
    var buttons = document.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < Math.min(buttons.length, 15); j++) {
        var btn = buttons[j];
        summary.buttons.push({
            text: (btn.innerText || '').trim().substring(0, 50),
            id: btn.id || '',
            className: (btn.className || '').substring(0, 80)
        });
    }

    summary.iframes = document.querySelectorAll('iframe').length;
    summary.links = document.querySelectorAll('a[href]').length;

    return summary;
};

// 安全过滤：脱敏敏感信息
var sanitizeContext = function(context) {
    // 脱敏 URL 中的敏感查询参数
    if (context.url) {
        var sensitiveParams = ['token', 'session', 'auth', 'key', 'password', 'secret', 'access_token'];
        try {
            var urlObj = new URL(context.url);
            sensitiveParams.forEach(function(param) {
                if (urlObj.searchParams.has(param)) {
                    urlObj.searchParams.set(param, '***');
                }
            });
            context.url = urlObj.toString();
        } catch (e) { /* URL 解析失败则保留原文 */ }
    }
    return context;
};
```

**上下文数据量控制策略**：

AI 上下文窗口有限，需控制发送给 AI 的上下文数据量，避免 token 浪费：

| 数据项 | 最大长度 | 截断策略 |
|--------|---------|---------|
| URL | 原始长度 | 脱敏敏感参数，不截断 |
| title | 200 字符 | `substring(0, 200)` |
| metaDescription | 200 字符 | `substring(0, 200)` |
| selectedElement.innerText | 500 字符 | `substring(0, 500)` |
| selectedElement.className | 200 字符 | `substring(0, 200)` |
| selectedElement.attributes | 10 个属性 | 每个值 `substring(0, 100)` |
| DOM 摘要 inputs | 20 个 | 超过跳过 |
| DOM 摘要 buttons | 15 个 | 每个文本 `substring(0, 50)` |

**上下文在系统提示词中的注入**：

`buildSystemPrompt()` 将采集的上下文结构化地注入系统提示词，AI 据此生成更精确的脚本：

```
You are a Tampermonkey userscript generator.

=== Page Context ===
URL: https://example.com/page
Domain: example.com
Title: Example Page Title
Protocol: https:
Body classes: page-home logged-in
Meta description: Page description...

=== Selected Element ===
Tag: DIV | ID: content-area | Classes: main-content sidebar
Attributes: data-role="article" role="main"
CSS Selector: #content-area.main-content
Text: Selected text content...
Parent: <MAIN id="main-wrapper">

=== Page Structure Summary ===
Forms: 2
Inputs: [text#search-box, submit]
Buttons: [Submit#submit-btn.btn-primary]
Iframes: 1 | Links: 42

=== Requirements ===
1. The script MUST start with a ==UserScript== metadata block
2. Suggested @match: *://example.com/*
3. Use GM_* APIs when appropriate
4. Target element: #content-area.main-content
...
```

---

### 2.1.2 AI 服务商适配器 — `src/ai-provider.js`

#### 模块注册

遵循项目 Registry 模式，IIFE 封装 + `Registry.require` 声明依赖 + `Registry.register` 注册：

```js
(function() {
    Registry.require('helper');
    Registry.require('xmlhttprequest');

    var Helper = Registry.get('helper');
    var xmlhttpRequest = Registry.get('xmlhttprequest').run;

    // ... 模块实现 ...

    Registry.register('ai-provider', aiProvider);
})();
```

#### 核心接口

```js
var aiProvider = {
    /**
     * 调用 AI 生成脚本（主入口）
     * @param {Object} config - AI 配置 {provider, apiEndpoint, apiKey, model, maxTokens, temperature}
     * @param {string} prompt - 用户自然语言输入
     * @param {Object} context - 页面上下文 {url, title, domain, selectedElement}
     * @param {Function} callback - 回调 function(error, code)
     */
    chat: function(config, prompt, context, callback) { ... },

    /**
     * 测试 API 连接
     * @param {Object} config - AI 配置
     * @param {Function} callback - 回调 function(error, result)
     */
    testConnection: function(config, callback) { ... },

    /**
     * 获取服务商默认配置
     * @param {string} provider - 服务商标识
     * @returns {Object} 默认配置 {apiEndpoint, model}
     */
    getProviderDefaults: function(provider) { ... },

    /**
     * 构建 AI 系统提示词
     * @param {Object} context - 页面上下文
     * @returns {string} 系统提示词
     */
    buildSystemPrompt: function(context) { ... }
};
```

#### 服务商适配层

**设计思路**：OpenAI / Gemini / 自定义端点均采用 OpenAI 兼容的 Chat Completions 格式，共享一套请求构建逻辑；Claude 采用 Anthropic 原生 Messages API，需要独立的请求/响应适配。

**OpenAI 兼容接口**（覆盖 OpenAI / Gemini / 自定义）：

```js
var openaiCompatibleRequest = function(config, messages, callback) {
    var headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey
    };
    var body = {
        model: config.model,
        messages: messages,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7
    };

    var details = {
        method: 'POST',
        url: config.apiEndpoint,
        headers: headers,
        data: JSON.stringify(body)
    };

    xmlhttpRequest(details, function(response) {
        if (response.status === 200) {
            try {
                var data = JSON.parse(response.responseText);
                var code = extractCodeFromResponse(data.choices[0].message.content);
                callback(null, code);
            } catch (e) {
                callback('Failed to parse AI response: ' + e.message, null);
            }
        } else if (response.status === 401) {
            callback('Authentication failed: Invalid API key', null);
        } else if (response.status === 429) {
            callback('Rate limit exceeded: Please try again later', null);
        } else {
            callback('API error: ' + response.status + ' ' + response.statusText, null);
        }
    });
};
```

**Claude Messages API 适配**：

Claude API 与 OpenAI 格式的关键差异：
1. 认证方式：`x-api-key` 头 + `anthropic-version` 头，非 Bearer Token
2. system 消息：作为顶层 `system` 字段传入，不放入 `messages` 数组
3. 响应格式：`content[0].text` 而非 `choices[0].message.content`

```js
var claudeRequest = function(config, messages, callback) {
    var headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
    };

    // Claude API 格式转换：system 单独传，messages 仅含 user/assistant
    var systemMsg = '';
    var claudeMessages = [];
    for (var i = 0; i < messages.length; i++) {
        if (messages[i].role === 'system') {
            systemMsg = messages[i].content;
        } else {
            claudeMessages.push(messages[i]);
        }
    }

    var body = {
        model: config.model,
        max_tokens: config.maxTokens || 4096,
        system: systemMsg,
        messages: claudeMessages
    };

    var details = {
        method: 'POST',
        url: config.apiEndpoint,
        headers: headers,
        data: JSON.stringify(body)
    };

    xmlhttpRequest(details, function(response) {
        if (response.status === 200) {
            try {
                var data = JSON.parse(response.responseText);
                var code = extractCodeFromResponse(data.content[0].text);
                callback(null, code);
            } catch (e) {
                callback('Failed to parse Claude response: ' + e.message, null);
            }
        } else if (response.status === 401) {
            callback('Authentication failed: Invalid API key', null);
        } else if (response.status === 429) {
            callback('Rate limit exceeded: Please try again later', null);
        } else {
            callback('Claude API error: ' + response.status, null);
        }
    });
};
```

**chat() 主入口 — 服务商路由**：

```js
var chat = function(config, prompt, context, callback) {
    var systemPrompt = buildSystemPrompt(context);
    var messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    switch (config.provider) {
        case 'openai':
        case 'gemini':
        case 'custom':
            openaiCompatibleRequest(config, messages, callback);
            break;
        case 'claude':
            claudeRequest(config, messages, callback);
            break;
        default:
            callback('Unknown AI provider: ' + config.provider, null);
    }
};
```

#### 代码提取逻辑

AI 返回内容可能包含 Markdown 代码块包裹、多余的解释文字，需要提取实际脚本代码。采用三级降级策略：

```js
var extractCodeFromResponse = function(text) {
    // 策略1：提取 ```javascript 或 ```js 代码块
    var codeBlockRegex = /```(?:javascript|js)\s*\n([\s\S]*?)```/;
    var match = text.match(codeBlockRegex);
    if (match) return match[1].trim();

    // 策略2：提取 ==UserScript== 开头的代码段
    var usRegex = /\/\/\s*==UserScript==[\s\S]*\/\/\s*==\/UserScript==[\s\S]*/;
    match = text.match(usRegex);
    if (match) return match[0].trim();

    // 策略3：最终降级，返回原文（后续 scriptParser 验证会拦截无效脚本）
    return text.trim();
};
```

#### 系统提示词设计

系统提示词是 AI 生成质量的关键。设计原则：
1. 明确输出格式要求（`==UserScript==` 元数据头）
2. 注入页面上下文辅助 AI 生成精确的 `@match` 规则
3. 安全约束防止生成危险代码
4. 指导使用 Tampermonkey GM_* API

```js
var buildSystemPrompt = function(context) {
    var prompt = '';
    prompt += 'You are a Tampermonkey userscript generator. ';
    prompt += 'Generate a valid userscript based on the user\'s request.\n\n';
    prompt += 'Requirements:\n';
    prompt += '1. The script MUST start with a ==UserScript== metadata block\n';
    prompt += '2. Include @name, @namespace, @version, @description, @match, @grant tags\n';
    prompt += '3. Use GM_* APIs when appropriate (GM_setValue, GM_getValue, GM_xmlhttpRequest, etc.)\n';
    prompt += '4. Avoid dangerous operations (eval, innerHTML with user input, etc.)\n';
    prompt += '5. Output ONLY the userscript code, no explanations\n\n';

    if (context) {
        if (context.url) {
            prompt += 'Current page URL: ' + context.url + '\n';
            // 自动生成 @match 规则建议
            var matchRule = context.url.replace(/^https?:\/\//, '*://').replace(/\/[^\/]*$/, '/*');
            prompt += 'Suggested @match: ' + matchRule + '\n';
        }
        if (context.title) {
            prompt += 'Page title: ' + context.title + '\n';
        }
        if (context.domain) {
            prompt += 'Domain: ' + context.domain + '\n';
        }
        if (context.selectedElement) {
            prompt += 'Selected element: <' + context.selectedElement.tagName;
            if (context.selectedElement.id) prompt += ' id="' + context.selectedElement.id + '"';
            if (context.selectedElement.className) prompt += ' class="' + context.selectedElement.className + '"';
            prompt += '>\n';
        }
    }

    return prompt;
};
```

#### 服务商默认配置

```js
var providerDefaults = {
    openai: {
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o'
    },
    gemini: {
        apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: 'gemini-2.0-flash'
    },
    claude: {
        apiEndpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-sonnet-4-20250514'
    },
    custom: {
        apiEndpoint: '',
        model: ''
    }
};
```

#### 连接测试实现

```js
var testConnection = function(config, callback) {
    // 发送一个最简请求验证 API 可用性
    var testConfig = {};
    for (var k in config) {
        testConfig[k] = config[k];
    }
    testConfig.maxTokens = 10;  // 最小 token 消耗

    chat(testConfig, 'Reply with exactly: OK', null, function(error, code) {
        if (error) {
            callback(error, null);
        } else {
            callback(null, 'Connection successful');
        }
    });
};
```

#### 错误码映射

| HTTP 状态码 | 错误含义 | 用户提示 |
|------------|---------|---------|
| 401 | 认证失败 | API Key 无效 |
| 403 | 权限不足 | 无权访问该模型 |
| 404 | 端点不存在 | API 端点或模型名称错误 |
| 429 | 请求限频 | 请求过于频繁，请稍后重试 |
| 500/502/503 | 服务端错误 | AI 服务暂时不可用 |
| 网络错误 | 无法连接 | 请检查网络或代理设置 |

---

### 2.1.3 AI 浮动面板 — `src/ai-panel.js` + `src/ai-panel.css`

#### 注入策略

浮动面板由 content script 动态注入到页面 DOM 中。注入时序和策略：

1. **注入时机**：`content.js` 在 DOMContentLoaded 后查询 background 是否启用 AI 功能
2. **注入方式**：通过创建 `<link>` 和 `<script>` 元素注入 CSS/JS 到页面 DOM
3. **命名空间隔离**：所有 DOM 元素 ID 和 CSS class 使用 `tm-ai-` 前缀
4. **资源访问**：`ai-panel.js` 和 `ai-panel.css` 需添加到 `manifest.json` 的 `web_accessible_resources`

**content.js 集成点**：

```js
// content.js 新增逻辑
var initAIPanel = function() {
    chrome.extension.sendMessage({ method: 'aiIsConfigured' }, function(response) {
        if (response && response.enabled) {
            injectAIPanel();
        }
    });
};

var injectAIPanel = function() {
    // 注入 CSS
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.extension.getURL('ai-panel.css');
    (document.head || document.documentElement).appendChild(link);

    // 注入 JS（执行面板创建逻辑）
    var script = document.createElement('script');
    script.src = chrome.extension.getURL('ai-panel.js');
    (document.head || document.documentElement).appendChild(script);
};
```

#### 面板 DOM 结构

面板有两种状态：收起态（浮动按钮）和展开态（聊天面板）。

```html
<!-- 收起状态：右下角浮动按钮 -->
<div id="tm-ai-toggle" class="tm-ai-toggle">
    <img src="chrome-extension://[EXT_ID]/icon.png" />
</div>

<!-- 展开状态：聊天式面板 -->
<div id="tm-ai-panel" class="tm-ai-panel tm-ai-hidden">
    <div class="tm-ai-header">
        <span class="tm-ai-title">Tampermonkey AI Assistant</span>
        <button class="tm-ai-close">×</button>
    </div>
    <div class="tm-ai-preview">
        <pre><code id="tm-ai-code"></code></pre>
    </div>
    <div class="tm-ai-input">
        <textarea id="tm-ai-prompt" placeholder="Describe what you want..."></textarea>
    </div>
    <div class="tm-ai-actions">
        <button id="tm-ai-generate" class="tm-ai-btn tm-ai-btn-primary">Generate</button>
        <button id="tm-ai-install" class="tm-ai-btn" disabled>Install</button>
        <button id="tm-ai-edit" class="tm-ai-btn" disabled>Edit</button>
        <button id="tm-ai-clear" class="tm-ai-btn">Clear</button>
    </div>
    <div id="tm-ai-status" class="tm-ai-status"></div>
</div>
```

#### CSS 命名空间隔离

所有 CSS 选择器以 `.tm-ai-` 为前缀，使用 `!important` 覆盖宿主页面可能的样式干扰：

```css
/* === 收起态浮动按钮 === */
.tm-ai-toggle {
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    width: 40px !important;
    height: 40px !important;
    z-index: 2147483647 !important;  /* 最大 z-index */
    cursor: pointer !important;
    border-radius: 50% !important;
    background: #1a73e8 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: transform 0.2s !important;
}
.tm-ai-toggle:hover {
    transform: scale(1.1) !important;
}
.tm-ai-toggle img {
    width: 24px !important;
    height: 24px !important;
}

/* === 展开态面板 === */
.tm-ai-panel {
    position: fixed !important;
    bottom: 70px !important;
    right: 20px !important;
    width: 380px !important;
    height: 500px !important;
    z-index: 2147483646 !important;
    background: #fff !important;
    border: 1px solid #ddd !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
    display: flex !important;
    flex-direction: column !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    font-size: 14px !important;
    color: #333 !important;
    overflow: hidden !important;
}
.tm-ai-hidden { display: none !important; }

/* === 头部区域 === */
.tm-ai-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 10px 14px !important;
    background: #1a73e8 !important;
    color: #fff !important;
    cursor: move !important;
}
.tm-ai-title { font-weight: 600 !important; font-size: 14px !important; }
.tm-ai-close {
    background: none !important; border: none !important;
    color: #fff !important; font-size: 20px !important;
    cursor: pointer !important;
}

/* === 代码预览区 === */
.tm-ai-preview {
    flex: 1 !important; overflow: auto !important;
    padding: 10px !important; background: #f5f5f5 !important;
    border-bottom: 1px solid #eee !important;
}
.tm-ai-preview pre {
    margin: 0 !important;
    font-family: 'Courier New', monospace !important;
    font-size: 12px !important;
    white-space: pre-wrap !important;
}

/* === 输入区 === */
.tm-ai-input textarea {
    width: 100% !important; min-height: 80px !important;
    max-height: 120px !important; padding: 8px !important;
    border: none !important; border-bottom: 1px solid #eee !important;
    resize: vertical !important; font-size: 13px !important;
    box-sizing: border-box !important; outline: none !important;
}

/* === 操作按钮区 === */
.tm-ai-actions {
    display: flex !important; gap: 6px !important;
    padding: 8px 10px !important; background: #fafafa !important;
}
.tm-ai-btn {
    padding: 6px 14px !important; border: 1px solid #ddd !important;
    border-radius: 4px !important; cursor: pointer !important;
    font-size: 13px !important; background: #fff !important;
}
.tm-ai-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
.tm-ai-btn-primary {
    background: #1a73e8 !important; color: #fff !important;
    border-color: #1a73e8 !important;
}

/* === 状态栏 === */
.tm-ai-status {
    padding: 6px 14px !important; font-size: 12px !important;
    color: #666 !important; border-top: 1px solid #eee !important;
}
```

#### 交互逻辑（ai-panel.js）

面板脚本运行在页面上下文中，通过 `chrome.extension.sendMessage` 与 background 通信：

```js
(function() {
    var generatedCode = '';
    var isGenerating = false;
    var toggle = document.getElementById('tm-ai-toggle');
    var panel = document.getElementById('tm-ai-panel');
    var promptInput = document.getElementById('tm-ai-prompt');
    var codePreview = document.getElementById('tm-ai-code');
    var generateBtn = document.getElementById('tm-ai-generate');
    var installBtn = document.getElementById('tm-ai-install');
    var editBtn = document.getElementById('tm-ai-edit');
    var clearBtn = document.getElementById('tm-ai-clear');
    var statusDiv = document.getElementById('tm-ai-status');

    // === 面板显隐切换 ===
    toggle.addEventListener('click', function() {
        panel.classList.toggle('tm-ai-hidden');
    });
    document.querySelector('.tm-ai-close').addEventListener('click', function() {
        panel.classList.add('tm-ai-hidden');
    });

    // === 拖拽支持 ===
    var makeDraggable = function(handle, target) {
        var startX, startY, initialLeft, initialTop;
        var onMouseDown = function(e) {
            e.preventDefault();
            startX = e.clientX; startY = e.clientY;
            var rect = target.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        var onMouseMove = function(e) {
            target.style.left = (initialLeft + e.clientX - startX) + 'px';
            target.style.top = (initialTop + e.clientY - startY) + 'px';
            target.style.right = 'auto';
            target.style.bottom = 'auto';
        };
        var onMouseUp = function() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        handle.addEventListener('mousedown', onMouseDown);
    };
    makeDraggable(document.querySelector('.tm-ai-header'), panel);

    // === 页面上下文采集（完整实现见 2.1.1 页面上下文资源管理）===
    var collectContext = function() {
        var context = {
            url: window.location.href,
            title: document.title,
            domain: window.location.hostname,
            protocol: window.location.protocol,
            charset: document.characterSet || '',
            bodyClass: document.body ? document.body.className : '',
            bodyId: document.body ? document.body.id : '',
            selectedElement: null
        };

        // 页面元数据
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) context.metaDescription = (metaDesc.content || '').substring(0, 200);

        // 选中元素
        var selection = window.getSelection();
        if (selection && selection.anchorNode) {
            var elem = selection.anchorNode.nodeType === 3
                ? selection.anchorNode.parentElement : selection.anchorNode;
            if (elem && !isAIPanelElement(elem)) {
                context.selectedElement = {
                    tagName: elem.tagName,
                    id: elem.id || '',
                    className: (elem.className || '').substring(0, 200),
                    innerText: (elem.innerText || '').substring(0, 500),
                    cssSelector: generateCssSelector(elem)
                };
            }
        }

        // DOM 摘要
        context.domSummary = collectDomSummary();

        // 安全过滤
        context = sanitizeContext(context);
        return context;
    };

    var isAIPanelElement = function(elem) {
        var id = elem.id || '';
        var cls = elem.className || '';
        return id.indexOf('tm-ai-') === 0 || cls.indexOf('tm-ai-') !== -1;
    };

    var generateCssSelector = function(elem) {
        if (elem.id) return '#' + CSS.escape(elem.id);
        var sel = elem.tagName.toLowerCase();
        if (elem.className) {
            var mainClass = elem.className.trim().split(/\s+/)[0];
            if (mainClass) sel += '.' + CSS.escape(mainClass);
        }
        return sel;
    };

    var collectDomSummary = function() {
        var s = {};
        s.forms = document.forms ? document.forms.length : 0;
        s.inputs = [];
        var inputs = document.querySelectorAll('input, select, textarea');
        for (var i = 0; i < Math.min(inputs.length, 20); i++) {
            s.inputs.push({ type: inputs[i].type || inputs[i].tagName.toLowerCase(), name: inputs[i].name || '', id: inputs[i].id || '' });
        }
        s.buttons = [];
        var buttons = document.querySelectorAll('button, [role="button"]');
        for (var j = 0; j < Math.min(buttons.length, 15); j++) {
            s.buttons.push({ text: (buttons[j].innerText || '').trim().substring(0, 50), id: buttons[j].id || '' });
        }
        return s;
    };

    var sanitizeContext = function(ctx) {
        if (ctx.url) {
            try {
                var u = new URL(ctx.url);
                ['token','session','auth','key','password','secret','access_token'].forEach(function(p) {
                    if (u.searchParams.has(p)) u.searchParams.set(p, '***');
                });
                ctx.url = u.toString();
            } catch(e) {}
        }
        return ctx;
    };

    // === 生成脚本 ===
    generateBtn.addEventListener('click', function() {
        if (isGenerating) return;
        var prompt = promptInput.value.trim();
        if (!prompt) { statusDiv.textContent = 'Please describe what you want'; return; }

        isGenerating = true;
        statusDiv.textContent = 'Generating...';
        generateBtn.disabled = true;

        chrome.extension.sendMessage({
            method: 'aiGenerate',
            prompt: prompt,
            context: collectContext()
        }, function(response) {
            isGenerating = false;
            generateBtn.disabled = false;
            if (response && response.code) {
                generatedCode = response.code;
                codePreview.textContent = response.code;
                installBtn.disabled = false;
                editBtn.disabled = false;
                statusDiv.textContent = 'Script generated successfully';
            } else {
                statusDiv.textContent = 'Error: ' + (response ? response.error : 'Unknown error');
            }
        });
    });

    // === 安装脚本 ===
    installBtn.addEventListener('click', function() {
        if (!generatedCode) return;
        installBtn.disabled = true;
        statusDiv.textContent = 'Installing...';
        chrome.extension.sendMessage({
            method: 'aiSaveScript', code: generatedCode
        }, function(response) {
            if (response && response.success) {
                statusDiv.textContent = 'Script installed successfully!';
            } else {
                installBtn.disabled = false;
                statusDiv.textContent = 'Installation failed: ' + (response ? response.error : 'Unknown error');
            }
        });
    });

    // === 编辑脚本 ===
    editBtn.addEventListener('click', function() {
        if (!generatedCode) return;
        chrome.extension.sendMessage({
            method: 'aiEditScript', code: generatedCode
        }, function() { statusDiv.textContent = 'Opening editor...'; });
    });

    // === 清除 ===
    clearBtn.addEventListener('click', function() {
        promptInput.value = ''; codePreview.textContent = '';
        generatedCode = ''; installBtn.disabled = true;
        editBtn.disabled = true; statusDiv.textContent = '';
    });

    // === 键盘快捷键：Ctrl+Enter 触发生成 ===
    promptInput.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); generateBtn.click(); }
    });
})();
```

---

### 2.1.4 AI 配置管理

AI 配置通过 `TM_storage` 持久化，所有读写操作在 background.js 中执行，确保 API Key 不泄露到页面上下文。

#### 配置数据结构

**存储键**：`TM_ai_config`

```js
{
    provider: "openai",           // openai | gemini | claude | custom
    apiEndpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "sk-xxxxxxxxxxxxx",   // 明文存储，界面掩码显示
    model: "gpt-4o",
    enabled: false,               // 是否启用浮动面板
    maxTokens: 4096,
    temperature: 0.7
}
```

#### 临时编辑存储

**存储键**：`TM_ai_edit_code`

用于 AI 面板点击"编辑"时，临时存储生成的代码，选项页编辑器打开后读取并清空。

#### 配置读写辅助函数（background.js）

```js
var getAIConfig = function() {
    var config = TM_storage.getValue('TM_ai_config', null);
    if (!config) {
        config = {
            provider: 'openai',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: '',
            model: 'gpt-4o',
            enabled: false,
            maxTokens: 4096,
            temperature: 0.7
        };
    }
    return config;
};

var maskApiKey = function(key) {
    if (!key || key.length < 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
};
```

#### ConfigObject 默认值扩展

在 [ConfigObject](file:///Users/jinxiong.yang/Code/tampermonkey/src/background.js#L2376) 的 `defaults` 对象中添加：

```js
ai_enabled: false,
ai_provider: 'openai',
ai_maxTokens: 4096,
ai_temperature: 0.7,
```

---

### 2.1.5 AI 消息处理器

所有 AI 相关消息处理器注册在 background.js 的 `requestHandling` 对象中，遵循现有消息权限控制模式。

#### 消息处理器一览

| 方法名 | 允许来源 | 异步响应 | 说明 |
|--------|---------|---------|------|
| `aiGenerate` | script | 是 | AI 脚本生成主入口 |
| `aiSaveScript` | script, extpage | 是 | 安装 AI 生成的脚本 |
| `aiEditScript` | script | 否 | 打开编辑器编辑 AI 脚本 |
| `aiIsConfigured` | insecure, script | 否 | 查询 AI 是否已配置启用 |
| `aiGetConfig` | extpage, options | 否 | 获取 AI 配置（Key 掩码） |
| `aiSaveConfig` | extpage, options | 是 | 保存 AI 配置 |
| `aiTestConnection` | extpage, options | 是 | 测试 AI API 连接 |

#### 各处理器详细设计

**aiGenerate** — AI 脚本生成核心处理器：

```js
"aiGenerate": {
    allow: { "script": true },
    exec: function(request, sender, sendResponse) {
        var config = getAIConfig();
        if (!config || !config.apiKey) {
            sendResponse({ error: 'AI not configured' });
            return;
        }
        aiProvider.chat(config, request.prompt, request.context || {}, function(error, code) {
            sendResponse(error ? { error: error } : { code: code });
        });
        return true; // 异步响应
    }
}
```

**aiSaveScript** — 安装 AI 生成的脚本，复用 `scriptParser` + `addNewUserScript` 流程：

```js
"aiSaveScript": {
    allow: { "script": true, "extpage": true },
    exec: function(request, sender, sendResponse) {
        var r = scriptParser.createScriptFromSrc(request.code);
        if (!r || !r.name) {
            sendResponse({ success: false, error: 'Invalid userscript format' });
            return;
        }
        addNewUserScript({
            name: r.name,
            tabid: sender.tab ? sender.tab.id : null,
            url: '', src: r.textContent,
            clean: true, ask: false, save: true,
            cb: function(installed) {
                if (installed) notifyOptionsTab();
                sendResponse({ success: installed });
            }
        });
        return true;
    }
}
```

**aiEditScript** — 将代码存入临时存储并打开选项页编辑器：

```js
"aiEditScript": {
    allow: { "script": true },
    exec: function(request, sender, sendResponse) {
        TM_storage.setValue('TM_ai_edit_code', request.code, function() {
            chrome.tabs.create({ url: chrome.extension.getURL('options.html') + '#ai_edit' });
        });
        sendResponse({ success: true });
    }
}
```

**aiIsConfigured** — 供 content.js 在页面加载时查询，决定是否注入浮动面板：

```js
"aiIsConfigured": {
    allow: { "insecure": true, "script": true },
    exec: function(request, sender, sendResponse) {
        var config = getAIConfig();
        sendResponse({
            enabled: config && config.enabled && !!config.apiKey,
            configured: !!config.apiKey
        });
    }
}
```

**aiGetConfig** — 获取 AI 配置，API Key 掩码处理后返回：

```js
"aiGetConfig": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        var config = getAIConfig();
        if (config && config.apiKey) config.apiKey = maskApiKey(config.apiKey);
        sendResponse(config || {});
    }
}
```

**aiSaveConfig** — 保存 AI 配置，处理掩码 Key 保留原值逻辑：

```js
"aiSaveConfig": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        var config = request.config;
        if (config.apiKey && config.apiKey.indexOf('****') !== -1) {
            config.apiKey = getAIConfig().apiKey;
        }
        TM_storage.setValue('TM_ai_config', config, function() {
            sendResponse({ success: true });
        });
        return true;
    }
}
```

**aiTestConnection** — 测试 AI API 连接可用性：

```js
"aiTestConnection": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        aiProvider.testConnection(request.config, function(error, result) {
            sendResponse(error ? { success: false, error: error } : { success: true, result: result });
        });
        return true;
    }
}
```

---

### 2.1.6 AI 设置标签页（选项页集成）

在 options.js 中利用现有 `TabView` 体系新增"AI 助手"标签页。遵循 [options.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/options.js) 中现有的标签页创建模式，使用 `crcrc.js` 的 `cr()` / `crc()` 构建 DOM。

#### 标签页 UI 结构

```
┌─────────────────────────────────────────────────┐
│  AI Assistant                                    │
├─────────────────────────────────────────────────┤
│  AI Provider:  [▼ OpenAI                      ] │
│  API Endpoint: [https://api.openai.com/...     ] │
│  API Key:      [••••••••••••                   ] │
│  Model:        [gpt-4o                         ] │
│  Max Tokens:   [4096    ]   Temperature: [0.7  ] │
│  ☑ Enable AI Panel on Pages                     │
│  [Test Connection]  [Save]                      │
│  ─── Connection Status ───                      │
│  ✓ Connection successful                         │
└─────────────────────────────────────────────────┘
```

#### 关键交互逻辑

1. **服务商切换**：选择服务商下拉框时，自动填充 `apiEndpoint` 和 `model` 默认值
2. **连接测试**：点击 "Test Connection" 发送 `aiTestConnection` 消息，显示成功/失败
3. **保存配置**：点击 "Save" 发送 `aiSaveConfig` 消息，处理掩码 Key
4. **初始加载**：标签页激活时发送 `aiGetConfig` 消息加载当前配置

#### options.html 修改

添加脚本引用：

```html
<script src="ai-provider.js"></script>
```

---

### 2.1.7 AI 数据流

#### 完整生成-安装流程

```
┌──────────┐       ┌────────────┐       ┌──────────────┐       ┌───────────┐
│ AI Panel │       │ content.js │       │ background.js│       │ AI API    │
│ (页面DOM) │       │            │       │              │       │           │
└────┬─────┘       └─────┬──────┘       └──────┬───────┘       └─────┬─────┘
     │                   │                      │                     │
     │ 1.用户输入需求    │                      │                     │
     │──采集页面上下文──→ │                      │                     │
     │                   │                      │                     │
     │ 2.sendMessage({method:"aiGenerate",prompt,context})              │
     │──────────────────────────────────────────→│                     │
     │                   │                      │                     │
     │                   │              3.getAIConfig()                │
     │                   │              4.buildSystemPrompt(context)   │
     │                   │              5.aiProvider.chat()            │
     │                   │                      │────────────────────→│
     │                   │                      │   POST /chat/completions
     │                   │                      │                     │
     │                   │                      │←────────────────────│
     │                   │                      │   6.AI返回脚本代码   │
     │                   │                      │   7.extractCode()   │
     │                   │                      │                     │
     │←──────────────────────────────────────────│                     │
     │  8.sendResponse({code:"..."})              │                     │
     │                   │                      │                     │
     │ 9.展示代码预览    │                      │                     │
     │                   │                      │                     │
     │ 10.用户点击"安装" │                      │                     │
     │ sendMessage({method:"aiSaveScript",code})  │                     │
     │──────────────────────────────────────────→│                     │
     │                   │                      │                     │
     │                   │     11.scriptParser.createScriptFromSrc()  │
     │                   │     12.addNewUserScript()                   │
     │                   │     13.notifyOptionsTab()                   │
     │                   │                      │                     │
     │←──────────────────────────────────────────│                     │
     │  14.sendResponse({success:true})          │                     │
```

---

## 2.2 Git 模块

### 2.2.1 模块总览

Git 模块负责实现“添加 Git 仓库 → 浏览 .user.js 文件 → 一键拉取安装”的完整闭环。由以下子组件构成：

| 子组件 | 文件 | 运行上下文 | 职责 |
|--------|------|-----------|------|
| Git 拉取核心 | `src/git-puller.js` | Background | 仓库 URL 解析、平台 API 适配、脚本下载 |
| Git 仓库管理 | — (集成在 background.js) | Background | 仓库列表 CRUD、脚本缓存管理 |
| Git 脚本标签页 | — (集成在 options.js) | Extension Page | 选项页 Git 仓库管理 UI |
| Git 浏览器动作 | — (集成在 action.js) | Extension Page | Popup 菜单快捷入口 |
| Git 消息处理器 | — (集成在 background.js) | Background | 消息路由、权限控制、流程编排 |

**模块架构图**：

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Options Page (options.js)                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 Git 脚本标签页                                │   │
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  │   │
│  │  │ 添加仓库表单     │  │ 仓库列表                          │  │   │
│  │  │ URL + Branch    │  │  ├─ 仓库1 [刷新][移除]            │  │   │
│  │  │ [添加]          │  │  │  ├─ script1.user.js [安装]     │  │   │
│  │  │                 │  │  │  └─ script2.user.js [安装]     │  │   │
│  │  │                 │  │  ├─ 仓库2 [刷新][移除]            │  │   │
│  │  │                 │  │  │  └─ ...                        │  │   │
│  │  └─────────────────┘  └──────────────────────────────────┘  │   │
│  │                     ↕ chrome.extension.sendMessage           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              ↕ 消息通道
┌─────────────────────────────────────────────────────────────────────┐
│                    Background (background.js)                        │
│  ┌───────────────────┐  ┌──────────────────────────────────────┐  │
│  │ Git 消息处理器      │  │ Git 拉取核心 (git-puller.js)          │  │
│  │ gitListScripts    │→ │  ┌──────────┐ ┌──────────┐ ┌───────┐ │  │
│  │ gitFetchScript    │  │  │ GitHub   │ │ GitLab   │ │ Gitea │ │  │
│  │ gitAddRepo        │  │  │ Adapter  │ │ Adapter  │ │Adapter│ │  │
│  │ gitRemoveRepo     │  │  └────┬─────┘ └────┬─────┘ └──┬────┘ │  │
│  │ gitGetRepos       │  │       └──────────┼───────────┘       │  │
│  └───────────────────┘  │         统一出口                     │  │
│  ┌───────────────────┐  │    parseRepoUrl → listScripts         │  │
│  │ Git 仓库管理        │  │    buildRawUrl → fetchScript          │  │
│  │ TM_git_repos      │  └──────────────────────────────────────┘  │
│  │ (CRUD + 缓存)      │  ┌──────────────────────────────────────┐  │
│  └───────────────────┘  │ scriptParser + addNewUserScript       │  │
│                          │ (复用现有安装流程)                      │  │
│                          └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↕ HTTPS
                    ┌──────────────────────┐
                    │   Git 平台 API        │
                    │  GitHub / GitLab /    │
                    │  Gitea (含自部署)      │
                    └──────────────────────┘
```

---

### 2.2.2 Git 拉取核心 — `src/git-puller.js`

#### 模块注册

```js
(function() {
    Registry.require('helper');
    Registry.require('xmlhttprequest');

    var Helper = Registry.get('helper');
    var xmlhttpRequest = Registry.get('xmlhttprequest').run;

    // ... 模块实现 ...

    Registry.register('git-puller', gitPuller);
})();
```

#### 核心接口

```js
var gitPuller = {
    parseRepoUrl: function(repoUrl) { ... },
    listScripts: function(repoInfo, callback) { ... },
    fetchScript: function(repoInfo, filePath, callback) { ... },
    buildRawUrl: function(repoInfo, filePath) { ... }
};
```

#### URL 解析与平台识别

支持以下 URL 格式的自动识别：

| 平台 | URL 格式 | 识别规则 |
|------|---------|---------|
| GitHub | `https://github.com/{owner}/{repo}` | 域名 `github.com` |
| GitLab (公共) | `https://gitlab.com/{owner}/{repo}` | 域名 `gitlab.com` |
| GitLab (自部署) | `https://{custom-host}/{owner}/{repo}` | API 探测 |
| Gitea | `https://{host}/{owner}/{repo}` | API 探测 |

```js
var parseRepoUrl = function(repoUrl) {
    var url = repoUrl.replace(/\/+$/, '').replace(/\.git$/, '');

    // GitHub
    var match = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
        return { platform: 'github', host: 'github.com', owner: match[1], repo: match[2], branch: 'main' };
    }

    // GitLab (gitlab.com)
    match = url.match(/^https?:\/\/gitlab\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
        return { platform: 'gitlab', host: 'gitlab.com', owner: match[1], repo: match[2], branch: 'main' };
    }

    // 通用格式：自部署 GitLab / Gitea / 其他
    match = url.match(/^https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
    if (match) {
        return { platform: 'auto', host: match[1], owner: match[2], repo: match[3], branch: 'main' };
    }

    return null;
};
```

#### 平台 API 适配

三大平台 API 各有差异，但核心流程一致：调用 Tree API → 递归遍历 → 过滤 `.user.js` → 返回文件列表。

**GitHub Tree API**：

- 端点：`GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
- 响应：`{ tree: [{ path, type, sha }], truncated }`
- 限制：单次最多 1000 条；GitHub API 限频 60次/小时（未认证）

```js
var githubListScripts = function(repoInfo, callback) {
    var apiUrl = 'https://api.github.com/repos/' + repoInfo.owner + '/' + repoInfo.repo
               + '/git/trees/' + repoInfo.branch + '?recursive=1';
    xmlhttpRequest({ method: 'GET', url: apiUrl, retries: 3 }, function(response) {
        if (response.status === 200) {
            try {
                var data = JSON.parse(response.responseText);
                var files = [];
                (data.tree || []).forEach(function(item) {
                    if (item.type === 'blob' && /\.user\.js$/.test(item.path)) {
                        files.push({ name: item.path.split('/').pop(), path: item.path, sha: item.sha });
                    }
                });
                callback(null, files);
            } catch (e) { callback('Failed to parse GitHub response', null); }
        } else if (response.status === 404) { callback('Repository not found', null); }
        else if (response.status === 403) { callback('GitHub API rate limit exceeded', null); }
        else { callback('GitHub API error: ' + response.status, null); }
    });
};
```

**GitLab Tree API**：

- 端点：`GET https://{host}/api/v4/projects/{id}/repository/tree?ref={branch}&recursive=true&per_page=100`
- Project ID 需 URL 编码：`encodeURIComponent('owner/repo')`
- 响应：`[{ id, name, type, path }]`

```js
var gitlabListScripts = function(repoInfo, callback) {
    var projectId = encodeURIComponent(repoInfo.owner + '/' + repoInfo.repo);
    var apiUrl = 'https://' + repoInfo.host + '/api/v4/projects/' + projectId
               + '/repository/tree?ref=' + repoInfo.branch + '&recursive=true&per_page=100';
    xmlhttpRequest({ method: 'GET', url: apiUrl, retries: 3 }, function(response) {
        if (response.status === 200) {
            try {
                var data = JSON.parse(response.responseText);
                var files = data.filter(function(item) {
                    return item.type === 'blob' && /\.user\.js$/.test(item.path);
                }).map(function(item) {
                    return { name: item.path.split('/').pop(), path: item.path };
                });
                callback(null, files);
            } catch (e) { callback('Failed to parse GitLab response', null); }
        } else if (response.status === 404) { callback('Repository not found', null); }
        else { callback('GitLab API error: ' + response.status, null); }
    });
};
```

**Gitea Tree API**：

- 端点：`GET https://{host}/api/v1/repos/{owner}/{repo}/git/trees/{branch}?recursive=true`
- 响应与 GitHub 类似：`{ tree: [{ path, type }] }`

```js
var giteaListScripts = function(repoInfo, callback) {
    var apiUrl = 'https://' + repoInfo.host + '/api/v1/repos/' + repoInfo.owner + '/' + repoInfo.repo
               + '/git/trees/' + repoInfo.branch + '?recursive=true';
    xmlhttpRequest({ method: 'GET', url: apiUrl, retries: 3 }, function(response) {
        if (response.status === 200) {
            try {
                var data = JSON.parse(response.responseText);
                var files = (data.tree || []).filter(function(item) {
                    return item.type === 'blob' && /\.user\.js$/.test(item.path);
                }).map(function(item) {
                    return { name: item.path.split('/').pop(), path: item.path };
                });
                callback(null, files);
            } catch (e) { callback('Failed to parse Gitea response', null); }
        } else { callback('Gitea API error: ' + response.status, null); }
    });
};
```

#### Raw URL 构建

```js
var buildRawUrl = function(repoInfo, filePath) {
    var encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    switch (repoInfo.platform) {
        case 'github':
            return 'https://raw.githubusercontent.com/' + repoInfo.owner + '/' + repoInfo.repo + '/' + repoInfo.branch + '/' + encodedPath;
        case 'gitlab':
            return 'https://' + repoInfo.host + '/' + repoInfo.owner + '/' + repoInfo.repo + '/-/raw/' + repoInfo.branch + '/' + encodedPath;
        case 'gitea':
            return 'https://' + repoInfo.host + '/' + repoInfo.owner + '/' + repoInfo.repo + '/raw/' + repoInfo.branch + '/' + encodedPath;
        default: return null;
    }
};
```

#### 平台自动探测

当 URL 无法直接识别为特定平台时，优先使用 API 版本端点快速探测：

```js
var detectPlatform = function(repoInfo, callback) {
    // 快速探测 Gitea
    xmlhttpRequest({ method: 'GET', url: 'https://' + repoInfo.host + '/api/v1/version', retries: 1 }, function(r1) {
        if (r1.status === 200) {
            repoInfo.platform = 'gitea';
            giteaListScripts(repoInfo, callback);
            return;
        }
        // 快速探测 GitLab
        xmlhttpRequest({ method: 'GET', url: 'https://' + repoInfo.host + '/api/v4/version', retries: 1 }, function(r2) {
            if (r2.status === 200) {
                repoInfo.platform = 'gitlab';
                gitlabListScripts(repoInfo, callback);
                return;
            }
            // 降级：依次尝试 Tree API
            repoInfo.platform = 'github';
            githubListScripts(repoInfo, function(err, files) {
                if (!err) { callback(null, files); return; }
                repoInfo.platform = 'gitlab';
                gitlabListScripts(repoInfo, function(err2, files2) {
                    if (!err2) { callback(null, files2); return; }
                    repoInfo.platform = 'gitea';
                    giteaListScripts(repoInfo, function(err3, files3) {
                        if (!err3) { callback(null, files3); return; }
                        callback('Unable to detect platform or repository not accessible', null);
                    });
                });
            });
        });
    });
};
```

#### fetchScript 实现

```js
var fetchScript = function(repoInfo, filePath, callback) {
    var rawUrl = buildRawUrl(repoInfo, filePath);
    if (!rawUrl) { callback('Cannot build raw URL', null); return; }
    xmlhttpRequest({ method: 'GET', url: rawUrl, retries: 3 }, function(response) {
        if (response.status === 200 && response.responseText) {
            callback(null, response.responseText);
        } else {
            callback('Failed to fetch script: HTTP ' + response.status, null);
        }
    });
};
```

---

### 2.2.3 Git 仓库管理

#### 仓库数据结构

**存储键**：`TM_git_repos`

```js
[
    {
        url: "https://github.com/user/my-scripts",
        platform: "github",
        host: "github.com",
        owner: "user",
        repo: "my-scripts",
        branch: "main",
        addedAt: 1716633600000,
        lastRefresh: 1716633600000,
        scriptsCache: [
            { name: "example.user.js", path: "scripts/example.user.js" }
        ]
    }
]
```

#### 缓存策略

- 刷新操作更新 `scriptsCache` 和 `lastRefresh`
- 仓库展开时优先使用缓存，无缓存时自动触发刷新
- 移除仓库时从数组中删除对应条目
- 批量安装时不更新缓存（缓存仅存储文件列表，不存储文件内容）

---

### 2.2.4 Git 消息处理器

所有 Git 相关消息处理器注册在 background.js 的 `requestHandling` 对象中。

#### 消息处理器一览

| 方法名 | 允许来源 | 异步响应 | 说明 |
|--------|---------|---------|------|
| `gitListScripts` | extpage, options | 是 | 列出仓库中的 .user.js 文件 |
| `gitFetchScript` | extpage, options | 是 | 下载并安装单个脚本 |
| `gitAddRepo` | extpage, options | 是 | 添加仓库到列表 |
| `gitRemoveRepo` | extpage, options | 是 | 从列表移除仓库 |
| `gitGetRepos` | extpage, options | 否 | 获取仓库列表 |

#### 各处理器详细设计

**gitListScripts** — 列出仓库中的脚本文件，支持缓存：

```js
"gitListScripts": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        var repoInfo = gitPuller.parseRepoUrl(request.repoUrl);
        if (!repoInfo) { sendResponse({ error: 'Invalid repository URL' }); return; }
        if (request.branch) repoInfo.branch = request.branch;

        if (request.forceRefresh || !hasCache(repoInfo)) {
            gitPuller.listScripts(repoInfo, function(error, files) {
                if (error) { sendResponse({ error: error }); }
                else { updateRepoCache(repoInfo, files); sendResponse({ files: files, repoInfo: repoInfo }); }
            });
        } else {
            sendResponse({ files: getRepoCache(repoInfo), repoInfo: repoInfo, fromCache: true });
        }
        return true;
    }
}
```

**gitFetchScript** — 下载并安装脚本，复用 `scriptParser` + `addNewUserScript`：

```js
"gitFetchScript": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        var rawUrl = request.rawUrl;
        if (!rawUrl) { sendResponse({ error: 'Missing raw URL' }); return; }
        xmlhttpRequest({ method: 'GET', url: rawUrl, retries: 3 }, function(response) {
            if (response.status === 200 && response.responseText) {
                var r = scriptParser.createScriptFromSrc(response.responseText);
                if (!r || !r.name) { sendResponse({ error: 'Invalid userscript format' }); return; }
                addNewUserScript({
                    name: r.name, tabid: sender.tab ? sender.tab.id : null,
                    url: rawUrl, src: r.textContent,
                    clean: true, ask: false, save: true,
                    cb: function(installed) {
                        if (installed) notifyOptionsTab();
                        sendResponse({ success: installed, scriptName: r.name });
                    }
                });
            } else {
                sendResponse({ error: 'Failed to fetch script: HTTP ' + response.status });
            }
        });
        return true;
    }
}
```

**gitAddRepo** — 添加仓库并去重检查：

```js
"gitAddRepo": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        var repos = TM_storage.getValue('TM_git_repos', []);
        for (var i = 0; i < repos.length; i++) {
            if (repos[i].url === request.repoUrl) {
                sendResponse({ error: 'Repository already exists' }); return;
            }
        }
        var repo = {
            url: request.repoUrl, platform: request.platform || 'auto',
            host: request.host || '', owner: request.owner || '',
            repo: request.repoName || '', branch: request.branch || 'main',
            addedAt: (new Date()).getTime(), lastRefresh: null, scriptsCache: null
        };
        repos.push(repo);
        TM_storage.setValue('TM_git_repos', repos, function() { sendResponse({ success: true, repos: repos }); });
        return true;
    }
}
```

**gitRemoveRepo** / **gitGetRepos** — 移除/获取仓库：

```js
"gitRemoveRepo": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        var repos = TM_storage.getValue('TM_git_repos', []);
        if (request.index >= 0 && request.index < repos.length) repos.splice(request.index, 1);
        TM_storage.setValue('TM_git_repos', repos, function() { sendResponse({ success: true, repos: repos }); });
        return true;
    }
},
"gitGetRepos": {
    allow: { "extpage": true, "options": true },
    exec: function(request, sender, sendResponse) {
        sendResponse({ repos: TM_storage.getValue('TM_git_repos', []) });
    }
}
```

---

### 2.2.5 Git 脚本标签页（选项页集成）

在 options.js 中利用 `TabView` 新增"Git 脚本"标签页。

#### 标签页 UI 结构

```
┌─────────────────────────────────────────────────────────────┐
│  Git Scripts                                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─ Add Repository ───────────────────────────────────────┐ │
│  │  Repository URL: [https://github.com/user/scripts    ] │ │
│  │  Branch:          [main                              ] │ │
│  │  [Add]                                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ My Scripts (github.com) ─── [Refresh] [Remove] ──────┐ │
│  │  📄 example.user.js     scripts/example.user.js        │ │
│  │     [Install]  [View Source]                            │ │
│  │  📄 helper.user.js      scripts/helper.user.js         │ │
│  │     [Install]  [View Source]  ✓ Installed              │ │
│  │  ─────────────────────────────────────────────          │ │
│  │  [Install All]  [Check Updates]                        │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ Another Repo (gitea.io) ── [Refresh] [Remove] ───────┐ │
│  │  (collapsed - click to expand)                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 关键交互逻辑

1. **添加仓库**：输入 URL → 调用 `gitAddRepo` → 自动识别平台 → 刷新列表
2. **展开/折叠仓库**：点击仓库标题展开，首次展开自动加载脚本列表
3. **刷新**：调用 `gitListScripts` (forceRefresh=true) 更新缓存
4. **安装单个脚本**：调用 `gitFetchScript` → 显示安装结果
5. **全部安装**：遍历脚本列表逐个调用 `gitFetchScript`
6. **查看源码**：下载脚本后在编辑器中打开
7. **已安装标识**：对比 `scriptParser.getScriptId(name)` 与已安装脚本列表
8. **检查更新**：对比已安装脚本版本与仓库中脚本的 `@version` 元数据

#### options.html 修改

添加脚本引用：

```html
<script src="git-puller.js"></script>
```

---

### 2.2.6 Git 浏览器动作集成

在 [action.js](file:///Users/jinxiong.yang/Code/tampermonkey/src/action.js) 的 `createActionsMenu` 函数中添加"从 Git 拉取"菜单项：

```js
var gitPullItem = {
    name: I18N.getMessage('Pull_from_Git'),
    id: 'gitPullAction',
    image: chrome.extension.getURL('images/download.gif'),
    url: chrome.extension.getURL('options.html') + '#git_scripts',
    newtab: true
};
items.push({ divider: true });
items.push(gitPullItem);
```

---

### 2.2.7 Git 数据流

```
┌──────────┐       ┌──────────────┐       ┌────────────┐       ┌──────────┐
│ Options  │       │ background.js│       │ git-puller │       │ Git API  │
│ Page     │       │              │       │            │       │          │
└────┬─────┘       └──────┬───────┘       └─────┬──────┘       └────┬─────┘
     │ 1.用户添加仓库URL  │                     │                    │
     │ gitAddRepo        │                     │                    │
     │───────────────────→│ TM_storage.setValue │                    │
     │←───────────────────│                     │                    │
     │                    │                     │                    │
     │ 2.用户展开仓库     │                     │                    │
     │ gitListScripts(repoUrl, forceRefresh)    │                    │
     │───────────────────→│ parseRepoUrl()      │                    │
     │                    │ listScripts()       │                    │
     │                    │────────────────────→│ GET /git/trees/   │
     │                    │                     │───────────────────→│
     │                    │                     │←───────────────────│
     │                    │                     │ 过滤.user.js文件  │
     │                    │←────────────────────│                    │
     │                    │ 更新缓存            │                    │
     │←───────────────────│                     │                    │
     │ 3.展示脚本列表     │                     │                    │
     │                    │                     │                    │
     │ 4.用户点击"安装"   │                     │                    │
     │ gitFetchScript(rawUrl)                    │                    │
     │───────────────────→│ xmlhttpRequest      │                    │
     │                    │────────────────────────────────────────→│
     │                    │←────────────────────────────────────────│
     │                    │ scriptParser.createScriptFromSrc()    │
     │                    │ addNewUserScript()  │                    │
     │←───────────────────│ sendResponse        │                    │
```

---

## 3. 现有模块修改汇总

### 3.1 background.html

添加新模块脚本引用：

```html
<script src="ai-provider.js"></script>
<script src="git-puller.js"></script>
```

### 3.2 background.js

- 添加 `Registry.require('ai-provider')` 和 `Registry.require('git-puller')` 声明
- 新增 12 个消息处理器（AI 7个 + Git 5个）
- 新增 `getAIConfig()`、`maskApiKey()` 辅助函数
- 扩展 `ConfigObject.defaults` 添加 AI 相关默认值

### 3.3 content.js

- 添加 `initAIPanel()` / `injectAIPanel()` 函数
- 在 DOMContentLoaded 后查询 AI 是否启用并注入面板

### 3.4 options.html + options.js

- 添加 `ai-provider.js` 和 `git-puller.js` 引用
- 新增"AI 助手"标签页创建函数
- 新增"Git 脚本"标签页创建函数
- 注册到 TabView

### 3.5 action.js

- 添加"从 Git 拉取"菜单项

### 3.6 style.css

- 添加 AI 设置和 Git 脚本相关样式

---

## 4. 安全设计

### 4.1 API Key 安全

- **存储**：API Key 在 `TM_storage` 中明文存储（与现有密码存储策略一致），`TM_storage` 底层使用 Web SQL Database 或 localStorage，数据仅在扩展上下文可访问
- **传输**：API Key 仅在 background.js 上下文中使用，从不传递到 content script 或页面 DOM
- **界面展示**：选项页中 API Key 以掩码形式显示（如 `sk-x...xxxx`），编辑时如未修改则保留原值

### 4.2 脚本验证安全

- 所有 AI 生成脚本和 Git 拉取脚本均经过 `scriptParser.createScriptFromSrc()` 验证
- 验证确保包含合法的 `==UserScript==` 元数据头
- 安装流程复用现有 `addNewUserScript` 机制

### 4.3 浮动面板安全

- DOM 元素使用 `tm-ai-` 前缀命名空间
- CSS 使用 `!important` 优先级避免与宿主页面冲突
- 面板 `z-index` 设为 `2147483647`
- 面板与页面的 JS 上下文隔离

### 4.4 消息权限矩阵

| 方法 | 允许来源 | 方法 | 允许来源 |
|------|---------|------|---------|
| `aiGenerate` | script | `gitListScripts` | extpage, options |
| `aiSaveScript` | script, extpage | `gitFetchScript` | extpage, options |
| `aiEditScript` | script | `gitAddRepo` | extpage, options |
| `aiIsConfigured` | insecure, script | `gitRemoveRepo` | extpage, options |
| `aiGetConfig` | extpage, options | `gitGetRepos` | extpage, options |
| `aiSaveConfig` | extpage, options | | |
| `aiTestConnection` | extpage, options | | |

---

## 5. 国际化

### 5.1 新增消息键

在 `i18n/en/messages.json` 和 `i18n/zh_CN/messages.json` 中添加：

**AI 助手相关**：

| 消息键 | 英文 | 简体中文 |
|--------|------|---------|
| `AI_Assistant` | AI Assistant | AI 助手 |
| `AI_Provider` | AI Provider | AI 服务商 |
| `API_Endpoint` | API Endpoint | API 端点 |
| `API_Key` | API Key | API 密钥 |
| `Model` | Model | 模型 |
| `Max_Tokens` | Max Tokens | 最大 Token 数 |
| `Temperature` | Temperature | 温度参数 |
| `Enable_AI_Panel` | Enable AI Panel | 启用 AI 面板 |
| `Test_Connection` | Test Connection | 测试连接 |
| `Connection_Success` | Connection successful | 连接成功 |
| `Generate_Script` | Generate | 生成 |
| `Install_Script` | Install | 安装 |
| `Edit_Script` | Edit | 编辑 |
| `Clear` | Clear | 清除 |
| `Describe_Your_Need` | Describe what you want... | 描述你的需求... |

**Git 脚本相关**：

| 消息键 | 英文 | 简体中文 |
|--------|------|---------|
| `Git_Scripts` | Git Scripts | Git 脚本 |
| `Add_Repository` | Add Repository | 添加仓库 |
| `Repository_URL` | Repository URL | 仓库 URL |
| `Branch` | Branch | 分支 |
| `Pull_from_Git` | Pull from Git | 从 Git 拉取 |
| `Refresh` | Refresh | 刷新 |
| `Install_All` | Install All | 全部安装 |
| `Check_Updates` | Check Updates | 检查更新 |
| `View_Source` | View Source | 查看源码 |
| `Already_Installed` | Installed | 已安装 |

---

## 6. Manifest 修改

需在 `manifest.json` 中添加 `ai-panel.js` 和 `ai-panel.css` 到 `web_accessible_resources`：

```json
{
    "web_accessible_resources": [
        "ai-panel.js",
        "ai-panel.css",
        "icon.png"
    ]
}
```

---

## 7. 文件清单

### 新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/ai-provider.js` | JS 模块 | AI 服务商适配、API 调用、响应解析 |
| `src/ai-panel.js` | JS（页面注入） | AI 浮动面板交互逻辑 |
| `src/ai-panel.css` | CSS（页面注入） | AI 浮动面板样式 |
| `src/git-puller.js` | JS 模块 | Git 仓库 URL 解析、平台 API 适配、脚本下载 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/background.html` | 添加 `ai-provider.js`、`git-puller.js` 引用 |
| `src/background.js` | 添加 Registry 声明；新增 12 个消息处理器；辅助函数；Config 扩展 |
| `src/content.js` | 添加 AI 面板注入逻辑 |
| `src/options.html` | 添加 `ai-provider.js`、`git-puller.js` 引用 |
| `src/options.js` | 新增"AI 助手"和"Git 脚本"标签页 |
| `src/action.js` | 添加"从 Git 拉取"菜单项 |
| `src/style.css` | 添加 AI 设置和 Git 脚本相关样式 |
| `i18n/en/messages.json` | 添加 AI 和 Git 相关消息键 |
| `i18n/zh_CN/messages.json` | 添加 AI 和 Git 相关消息键（简体中文） |
| `manifest.json` | 添加 `web_accessible_resources` 条目 |

---

## 8. 实现顺序

```
Phase 1: AI 核心基础设施 (P0)
├── ai-provider.js — AI 服务商适配器
├── background.js — AI 消息处理器 + Config 扩展
└── manifest.json — web_accessible_resources

Phase 2: AI 前端 (P0+P1)
├── ai-panel.css — 浮动面板样式
├── ai-panel.js — 浮动面板逻辑
├── content.js — 面板注入集成
└── options.js + options.html — AI 设置标签页

Phase 3: Git 核心 (P1)
├── git-puller.js — Git 拉取核心
├── background.js — Git 消息处理器
└── options.js + options.html — Git 脚本标签页

Phase 4: 集成收尾 (P2)
├── action.js — Git 菜单项
├── i18n — 国际化消息键
└── style.css — 补充样式
```

---

## 9. 测试要点

### AI 功能测试

| 测试场景 | 验证点 |
|---------|--------|
| OpenAI 接口调用 | 请求格式、响应解析、代码提取 |
| Gemini 接口调用 | OpenAI 兼容格式适配 |
| Claude 接口调用 | Messages API 格式转换、system 消息处理 |
| 自定义端点 | 用户自定义 API 端点和模型 |
| 连接测试 | 成功/失败场景、错误信息展示 |
| 脚本生成 | 包含合法元数据头、`@match` 自动生成、GM_* API 使用 |
| 脚本安装 | `scriptParser` 验证通过、`addNewUserScript` 执行成功 |
| 浮动面板注入 | 不影响宿主页面、正确显隐、拖拽移动 |
| API Key 安全 | 选项页掩码显示、不泄露到页面上下文 |

### Git 功能测试

| 测试场景 | 验证点 |
|---------|--------|
| GitHub 仓库 | URL 解析、Tree API 调用、`.user.js` 过滤 |
| GitLab 仓库 | project ID 编码、Tree API 调用 |
| Gitea 仓库 | API 调用、自部署实例 |
| 平台自动探测 | 未知 URL 的探测策略 |
| 仓库添加/移除 | `TM_storage` 持久化、列表更新 |
| 脚本安装 | Raw URL 构建、下载、解析验证、安装 |
| 批量安装 | 遍历安装、错误处理 |
| 脚本缓存 | 列表缓存避免重复请求 |
