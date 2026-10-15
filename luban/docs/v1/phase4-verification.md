# Phase 4 安全扫描 + 预览 · 验证记录

> 对应任务：`ai-automation-development-tasks.md` P4-T1 ~ P4-T4。
> 结论标注：`✓ 已自动化验证`（build/tsc/vitest/lint 可直接复现）｜`☐ 待真人实测`（需真实浏览器/Side Panel 操作）。

## 一、如何复现自动化验证

```bash
cd luban
npm install
npm run typecheck   # tsc --noEmit（0 错误）
npm run build        # 产出 dist/，SW 产物含 safety-scanner；Side Panel 产物含 microlighter
npm test              # vitest：本阶段新增 25 条（safety-scanner）+ 1 条 state-machine 回归 + 既有 80 条
npm run lint           # eslint（0 错误）
```

## 二、自动化验证结果

| 项 | 命令 | 结果 |
|----|------|------|
| 类型检查零错误 | `tsc --noEmit` | ✓ |
| 生产构建成功 | `vite build` | ✓（SW chunk 含 safety-scanner；Side Panel 产物含 microlighter + CodeBlock） |
| 安全扫描器单测 | `vitest run` | ✓ 25/25（`safety-scanner.test.ts`，7 类规则各 ≥2 正反例 + gmGrants 三分支 + 性能） |
| 状态机回归（取消生成语义变更） | `vitest run` | ✓ 10/10（`state-machine.test.ts`，新增「取消回 INTENT_INPUT 保留表单」「PREVIEW 态 SUBMIT_INTENT 重新生成」两条） |
| 全量回归 | `vitest run` | ✓ 106/106（8 个测试文件） |
| lint | `eslint .` | ✓ 0 错误 |

## 三、交付物对应（P4-T1 ~ P4-T4）

- **P4-T1 安全扫描器黑名单**（`src/service-worker/safety-scanner.ts`）：纯函数 `scanCode(code, gmGrants)` 按 §3.8 实现 7 类规则：①`eval`/`new Function` → blocked；②`document.cookie` 读取 + 网络发送（`fetch`/`XMLHttpRequest`/`.send(`/`sendBeacon`）同现 → blocked；③`localStorage.clear()`/`indexedDB.deleteDatabase()` → blocked；④`fetch`/`XMLHttpRequest` 存在即 → warning（无法静态判定是否跨域，统一提示人工确认）；⑤`while(true)`/`for(;;)` 括号配对提取循环体，体内无 `break` → blocked，`setTimeout`/`setInterval` 式周期刷新不触发该规则；⑥`__proto__`/`constructor.prototype` → warning；⑦中英文支付关键词（支付宝/微信支付/checkout/payment 等）→ warning。10KB 代码规模扫描 < 10ms（单测实测个位数毫秒）。
- **P4-T2 gmGrants 白名单校验**（同文件扩展）：声明的 `gmGrants` 中不在 `GM_P0_GRANTS`（6 项）白名单内的条目 → warning（「该脚本申请了不支持的权限…运行时将被打桩为空操作」，实际打桩逻辑留给 Phase 5 注入阶段）；代码中直接调用（正则匹配 `GM_[A-Za-z_]+`）且不在白名单内的 API → blocked（即使未在 `gmGrants` 中声明也会被拦截）。单测覆盖三分支：合法白名单（无提示）、超范围声明（warning 不拦截）、越权调用（blocked 拦截）。
- **P4-T3 预览视图 PreviewView**（`src/sidepanel/views/PreviewView.tsx`、`src/sidepanel/components/CodeBlock.tsx`，新依赖 `microlighter@2.2.0`）：`CodeBlock` 默认折叠仅显「展开代码 ▼」按钮，点击展开后挂载 `<pre><code class="language-javascript">` 并调用 `microlighter` 的 `highlightAll({root})`（CSS Custom Highlight API，不改变 DOM 结构，内联引入 `microlighter/themes/github.css` 主题）；`PreviewView` 新增 `blocked` 字段非空时的红色「包含被禁止的操作」提示区（列出每条 blocked 原因）、`confidence < 0.6` 时在置信度行追加黄色角标「置信度较低，建议重新生成」、`warnings` 逐条渲染、新增「补充要求」输入框供重新生成携带追加诉求；「运行」按钮 `disabled={!result.safety.passed}`。
- **P4-T4 确认/拒绝/重生成流程**：SW `handleGenerateScript`（`src/service-worker/index.ts`）移除 Phase 3 占位，改为对 `generateWithFallback` 返回的 `code`/`gmGrants` 调用真实 `scanCode`，`GenerationResult.safety` 为扫描真实结果，`warnings` 合并 AI 自报警告 + 扫描警告；`prompt-builder.ts` 的 `buildUserContent`/`buildMessages`/`buildStrengthenedMessages`/`generateWithFallback` 新增可选 `regenerateContext: {previousCode, previousWarnings, extraRequirement}` 参数，非空时在 user message 追加「上一轮代码 + 警告 + 用户补充要求，请输出修正后完整脚本」段落；消息协议新增 `RegenerateContext` 类型，`GenerateScriptMsg` 携带该字段；Side Panel `App.tsx` 的 `onSubmitIntent` 支持传入 `regenerateContext`，`PreviewView` 的「重新生成」按钮据此自动带上当前 `result.code`/`result.warnings`/用户填写的补充要求（无需用户重新描述完整意图）；状态机修正两处语义：`CANCEL_GEN` 从「回 IDLE」改为「回 INTENT_INPUT 并保留 element+intent」（取消不丢表单），`SUBMIT_INTENT` 新增对 `PREVIEW`/`RESULT` 态的处理（支持预览态直接重新生成进入 `GENERATING`）。

## 四、真人实测记录（2026-10-10）

本阶段单测均覆盖纯函数逻辑（扫描规则、prompt 拼装），`microlighter` 的 CSS Custom Highlight API 高亮效果、折叠展开的实际视觉表现、以及跨 SW/Side Panel 的真实链路需要在 Chrome 中加载扩展人工验证。真人实测中发现并修复两个问题：

1. **语法高亮完全不生效（阻断性 bug）**：`microlighter` 通过运行时模板字符串动态 import（`` import(`./grammars/${lang}.js`) ``）按需加载 TextMate 语法文件，Vite 核心不解析这种动态 import（需要额外插件），构建产物里不会自动带上 `grammars/` 目录；该导入在打包后的扩展里运行时实际 404，又被 microlighter 内部 `.catch(() => null)` 悄悄吞掉，导致高亮完全失效且没有任何报错。修复：在 `vite.config.ts` 新增一个 `closeBundle` 阶段的内联插件，把 `node_modules/microlighter/dist/grammars/javascript.js` 复制到 `dist/assets/grammars/javascript.js`，使该相对路径运行时 import 能真正解析到文件。（排查过程中还顺手修了一处前置问题：`CodeBlock.tsx` 最初把 `<pre>` 自身传给 `highlightAll({root})`，但默认选择器 `"pre > code"` 只匹配 root 的*后代*，`<pre>` 作为 root 时匹配不到自己的子节点；已改为用外层 `<div>` 包裹 `<pre><code>` 作为 root。）
2. **「重新生成」看起来卡死不动**：`GeneratingView` 的"已用时"原来只在收到 `GENERATION_PROGRESS` 消息时才重新渲染，模型两次增量输出之间若有停顿（补充要求重新生成的 prompt 比首次大很多，更容易出现停顿），计时会冻结在最后一次收到内容的时间点，让用户误判为卡死。修复：改用组件自身的 `setInterval` 每秒刷新一次，不再依赖消息驱动，诚实反映"仍在等待"而非"已经卡住"。

两处修复后重新 `npm run typecheck && npm run lint && npm test && npm run build`，均 0 错误 / 106 测试全绿 / 构建成功（`dist/assets/grammars/javascript.js` 产物已确认生成）。重新加载扩展后真人复测：

| # | 验收标准 | 期望 | 状态 |
|---|----------|------|------|
| 1 | 生成一段正常脚本并进入 PreviewView，展开代码块 | microlighter 语法高亮生效（关键字/字符串/注释等 token 正确着色），explanation/warnings/confidence 完整展示；展开/收起无明显布局跳动 | ✓ 通过 |
| 2 | 构造/诱导 AI 返回含 `eval(...)` 的脚本 | PreviewView 顶部出现红色「包含被禁止的操作」区并列出具体原因；「运行」按钮不可点击 | ✓ 通过 |
| 3 | 诱导 confidence < 0.6 的返回 | 置信度行出现「建议重新生成」黄色角标 | ✓ 通过 |
| 4 | 预览态填写「补充要求」后点「重新生成」 | 新一轮生成成功，不再卡在 GeneratingView；计时持续刷新 | ✓ 通过 |
| 5 | 生成过程中点击「取消」 | 返回 INTENT_INPUT 视图且原意图文本仍保留在输入框中（不是回到 IDLE 清空） | ✓ 通过 |
| 6 | 请求使用 `GM_xmlhttpRequest` 等超白名单权限的脚本 | PreviewView 的 warnings 区出现「该脚本申请了不支持的权限」提示，但不阻断运行 | ✓ 通过 |

**结论：Phase 4 全部 6 项真人实测通过。**

## 五、诚实边界（Phase 4 未实现，属后续阶段）

- gmGrants 运行时打桩：当前扫描层仅对越权声明给出 warning、对越权调用给出 blocked，真正的「运行时将不支持的 GM_* API 打桩为 no-op」需等 Phase 5 注入执行阶段落地。
- 「运行」按钮：`onRun` 仍是 Phase 1 占位反馈（"脚本注入将在 Phase 5 接入"），本阶段只打通「扫描 + 预览 + 重新生成」，不打通「真实运行」。
- 跨域判定：§3.8 的跨域 fetch/XHR 规则在静态扫描阶段无法准确判断"是否跨域"（代码里的 URL 可能是变量拼接而非字面量），当前统一按"存在网络请求"给 warning，不做更细粒度的域名级判定。
- Esc 二次确认：PRD 要求的"预览态 Esc 有二次确认"未在本阶段实现，当前预览态没有绑定 Esc 监听。
- 死循环检测的局限：仅能识别 `while(true)`/`for(;;)` 字面量写法且循环体为花括号包裹的情况，无法识别变量化的条件（如 `while(flag)` 且 `flag` 恒为 true）或多层嵌套循环体之间的 `break` 语义（例如内层 `break` 实际无法跳出外层死循环，当前实现只检查同一层括号块内是否出现 `break` 字面量，属于保守近似）。
- 重新生成的长尾延迟：携带上一轮代码的 `regenerateContext` 会让 user message 明显变大，首 token 延迟可能比首次生成更高；若 flash/pro 两轮都触发 60s 超时自动重试，理论上限接近 4 分钟才会报错退出。`GeneratingView` 已修复为每秒自行刷新计时（不再看起来"卡死"），但没有做更短的分级超时或"仍在处理，预计还需 Xs"之类的主动提示，耐心等待或在 `chrome://inspect/#service-workers` 的 Network 面板确认请求仍在进行即可。
