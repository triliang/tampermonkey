# 同类产品调研

> 调研日期：2026-10-11。事实来自各产品官网、官方文档或商店页；第三方对比文中的用户量和价格只作量级参考，不作为决策依据。
> 配套：[功能评审](./feature-review.md)、[优化机会](./optimization-opportunities.md)

## 市场怎么分

用户嘴里的「脚本插件」和「AI 聊天插件」不是同一件事。混在一张需求表里，会把鲁班做成一个什么都有一点的侧栏。

| 类型 | 用户要的结果 | 代表 |
|------|----------------|------|
| 脚本管理器 | 装一段别人写好的脚本，匹配网站后自动跑 | Tampermonkey、Violentmonkey、脚本猫 |
| AI 写脚本 | 用大白话改网页，留下可复用脚本 | Customaise、VibeMonkey、ScriptGenie |
| AI 侧栏 | 对着当前页聊天、总结、翻译、改写 | Monica、Sider、Merlin、豆包、Kimi、沉浸式翻译 |
| 网页操作代理 | 现在就帮我点、填、抓、跨页面做完 | HARPA、Nanobrowser、Claude in Chrome、Perplexity Comet |
| 无代码工作流 | 录制或连线，定时重复同一套点击 | Automa、Axiom.ai、Bardeen |

鲁班落在第二类，并借了第一类的 GM_* 心智。它不是侧栏聊天，也还不是代理。

## 和鲁班最接近的产品

三家的架构、思路和演进见 [Customaise、VibeMonkey、ScriptGenie](./customaise-vibemonkey-scriptgenie.md)。

### Customaise

[Customaise](https://customaise.com/) 用自然语言改当前网站，生成标准用户脚本，确认后在已登录的浏览器里运行。编辑器是 Monaco，有版本记录，可导出 `.user.js` 给 Tampermonkey / Violentmonkey，也有脚本市场。它另外做了 AgentScript：把站点能力包成工具，给 Cursor、Claude Code 等通过本机 MCP 调用。

和鲁班的差别：Customaise 不要求先点一个元素；脚本可带走；编辑和版本是一等能力；还往「把网页变成 Agent 工具」走了一步。鲁班的点选和选择器回退更精确，但脚本锁在扩展里。

### VibeMonkey、ScriptGenie

[VibeMonkey](https://github.com/dorser/vibemonkey) 几乎是同一形态：侧栏、看当前页结构、BYOK（Gemini）、描述想要的视觉改动、生成油猴脚本。它不负责运行，只提供复制或保存 `.user.js`。

[ScriptGenie](https://chromewebstore.google.com/detail/scriptgenie-ai%EF%BC%9Agenerate-b/hogmlmglhijddadgjjcbhehfiejpbeac) 用对话生成 Tampermonkey 兼容脚本，支持多家模型，带 Monaco 和版本回滚，Key 本地存储。商店页更新于 2026-04。

这两家说明：「侧栏 + BYOK + 按页面生成脚本」已经有人做。鲁班多出来的是确认后当场注入，以及 GM 运行时。少掉的是编辑器、版本和导出。

### 脚本猫

[脚本猫 v1.4](https://docs.scriptcat.org/docs/change/v1.4/) 在脚本管理器上加了 Agent（截至文档所述仍是开发版 / Beta，正式版未开放）。管理页可以多轮对话；内置网页抓取、标签页、DOM 点击与填充、截图、定时任务、Skill 和 MCP。用户脚本还能通过 `CAT.agent.*` 反过来调用这些能力。

这是中文市场最需要盯的对手：它已经有脚本生态和自动运行，Agent 是加在上面的。鲁班是先有生成、还没有生态，也还不会自动跑。

## AI 侧栏：不要对标的能力

[Monica](https://chromewebstore.google.com/detail/monica-all-in-one-ai-assi/ofpnmcalabcbjgholdjcjblkibolbppb)、Sider、Merlin、MaxAI 的主路径是快捷键打开侧栏，对页面、PDF、邮件做总结、翻译、改写和搜索。Monica 还有浏览器操作；Sider 强调多模型同问。国内的豆包、Kimi 插件同样是划词、总结、翻译和侧栏对话（[体验记录](https://www.woshipm.com/evaluating/6084791.html)）。沉浸式翻译则把双语对照做到了网页、PDF 和视频字幕。

用户已经习惯「选中文字就问」。若鲁班首页做成对话框，用户会期待总结和翻译，而不会期待生成一段下次还能跑的脚本。侧栏聊天的免费额度和模型更新速度，鲁班用 BYOK 也打不过。

可以从它们借的只有交互密度：当前页上下文默认带上、结果先给人话、常用动作放在手边。不要借功能清单。

## 网页代理与工作流

[HARPA](https://harpa.ai/) 把聊天和页面自动化放在一起：读页面、点击、填表、抽数据、价格监控、定时命令，可用自有云模型或 BYOK。商店页称超过 40 万用户。它的「命令」是预制场景，不是从零写脚本。

[Nanobrowser](https://github.com/nanobrowser/nanobrowser) 是开源扩展，BYOK，多 Agent（规划、导航、校验）在本机浏览器里跨站做任务，侧栏可追问。它替代的是 Operator 一类「帮我办完」，产物是一次任务，不是脚本。

[Claude in Chrome](https://www.howdoiuseai.com/blog/2026-09-16-ai-browsers-explained-atlas-vs-comet-vs-dia-and-wh) 能多标签操作、定时、读控制台和网络请求。Perplexity Comet、Dia 则是独立浏览器：前者偏代理式浏览，后者偏跨标签阅读。2025–2026 年多家被指出存在跨站提示注入风险（[TechRepublic 对七款代理浏览器的转述](https://www.techrepublic.com/article/news-best-ai-browsers-2026/)）。

[Automa](https://github.com/automaapp/automa) 用录制和积木连线做重复操作，有模板市场和定时。Axiom.ai 偏抓取和监控，Bardeen 偏 SaaS 工作流。它们强在「步骤可见、可重复」，弱在「不会写代码的人描述一个新意图」。

## 对照

| | 鲁班 v1 | Customaise | VibeMonkey | 脚本猫 + Agent | HARPA | Nanobrowser | Monica 类侧栏 |
|--|---------|------------|------------|----------------|-------|--------------|----------------|
| 输入 | 必须点选一个元素，再写意图 | 自然语言 | 自然语言 | 对话 + 已有脚本 | 命令 / 对话 | 对话式任务 | 划词 / 对话 |
| 产出 | 扩展内脚本 | 标准用户脚本，可导出 | `.user.js` 文件 | 脚本，且可调度 Agent | 当次自动化、监控 | 当次任务 | 回答、改写、摘要 |
| 何时再生效 | 手动再运行 | 按站点规则 | 交给油猴 | 按匹配规则自动跑 | 命令可定时 | 不沉淀 | 不沉淀 |
| 模型 | 仅 MiMo，BYOK | 产品内 AI | Gemini BYOK | 多家，兼容 OpenAI / Anthropic | 多家或 BYOK | 多家 BYOK，可本地 | 订阅为主 |
| 页面理解 | DOM 摘要 + 选择器 | 页面上下文 | 页面结构 | DOM、截图、抓取 | 页面结构与语义 | 多步浏览 | 选中文本 / 页面 |
| 执行前确认 | 有 | 有，敏感调用另确认 | 不在扩展内执行 | Agent 工具调用展示 | 命令式 | 任务过程可见 | 通常直接回答 |

## 对鲁班的含义

直接竞品证明「生成油猴脚本」本身不够差异化。能站住的是三件事同时成立：看懂当前页、生成可复用脚本、在用户确认后于本机运行。

脚本猫和 Customaise 已经分别补上了「自动跑」和「可编辑、可导出」。鲁班若 v2 仍只有手动再运行，会同时弱于脚本管理器和 AI 写脚本工具。

不要进入跨站代理和无代码录制。那两类的信任成本、提示注入面和步骤编辑器，都比当前团队要补的闭环大，而且 HARPA、Claude、Automa 已经占住心智。

侧栏聊天是流量入口，不是鲁班的产品。保留「对着这个页面做事」，拒绝「什么都能问」。
