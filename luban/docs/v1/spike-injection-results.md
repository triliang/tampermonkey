# 鲁班 Luban · Phase 0 注入验证 Spike —— 结果记录与注入策略定稿

> 对应开发任务：`ai-automation-development-tasks.md` §Phase 0（P0-T1 ~ P0-T4）
> 交叉引用：技术设计 `ai-automation-technical-design.md` §3.5 脚本注入引擎（降级链）、§十一 风险 #1/#9
> PoC 代码：`luban/spike/`（manifest.json / background.js / content.js / panel.html / panel.js / fixtures/*）
>
> **文档状态说明**：P0-T1/T2 的 PoC 代码已交付；下表「实测」列需由开发者在浏览器中点击扩展图标逐站采集后回填（工具已内置计时、CSP 头抓取、violation 捕获与一键复制 JSON）。`☐ 待实测` 为占位。

---

## 一、如何运行本 Spike（复现步骤）

1. **加载解压扩展**：打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择目录 `luban/spike/`。
   - 验收：扩展加载零报错；点开「Service Worker」链接，SW console 无红色 error。
2. **打开侧栏控制面板**：点击 Chrome 工具栏的侧边栏按钮 → 选择「鲁班 Luban · 注入验证 Spike」。（点击扩展图标也会自动打开侧栏。）
3. **选择注入方法**：在侧栏选择 Method 1 / 2 / 3 / Auto → 点「保存方法」。
4. **触发注入**：**点击工具栏的扩展图标**（此动作会授予当前标签页 `activeTab` 权限）。
   - 成功：页面所有 `<a>` 链接变红；右下角出现成功 toast。
   - 失败：右下角出现失败 toast，侧栏记录区显示错误 / CSP violation 详情。
5. **验证运行于 MAIN world**：在目标页按 F12 → Console → 把上下文从 `top`（默认即页面主上下文）执行：
   ```js
   __luban_poc        // 应输出 true
   __luban_poc_method // 应输出命中的方法号（1/2/3）
   ```
6. **采集数据**：侧栏「注入记录」显示 命中方法 / 耗时 ms / CSP 头摘要 / violation 详情；点「复制最近结果 JSON」粘贴到本文档对应行。
7. **本地 CSP fixtures**（P0-T2 用）：因 CSP `'self'` 需真实同源，必须经 HTTP 打开，不要用 `file://`：
   ```bash
   cd luban/spike/fixtures && python3 -m http.server 8000
   # 浏览器访问 http://localhost:8000/no-csp.html 等
   ```

---

## 二、P0-T1 / P0-T2 本地验收自查

### 2.1 P0-T1 最小骨架 + MAIN world 注入（验收 ①~④）

| # | 验收标准 | 操作 | 结果 |
|---|---------|------|------|
| ① | 加载解压扩展零报错（SW console 无 error） | 加载 `luban/spike/` | ☐ 待实测 |
| ② | 普通站点点击图标后所有链接变红 | 打开 `https://example.com` → 选 Method 1 → 点图标 | ☐ 待实测 |
| ③ | 页面主上下文执行 `__luban_poc` 输出 `true` | example.com Console 执行 | ☐ 待实测 |
| ④ | chrome:// 内置页点击图标异常被 catch + toast 提示，SW 不崩 | 打开 `chrome://extensions` → 点图标 | ☐ 待实测（预期：SW 不崩，侧栏记录「不可注入的页面」，无未捕获异常） |

### 2.2 P0-T2 降级注入路径（验收 ①~④，用本地 fixtures）

在下表每格填「命中/拦截 + 耗时 ms」，并把 violation 详情（`violatedDirective` / `originalPolicy`）附到「证据」列。

| 测试页 | CSP | Method 1（预期） | Method 2（预期） | Method 3（预期） | 实测 M1 | 实测 M2 | 实测 M3 | 证据（violation 摘要） |
|--------|-----|:---:|:---:|:---:|--------|--------|--------|--------|
| `no-csp.html` | 无 | ✓ | ✓ | ✓ | ☐ | ☐ | ☐ | — |
| `csp-strict.html` | `script-src 'self'` | ✓ | ✗ | ✗ | ☐ | ☐ | ☐ | ☐ 待实测 |
| `csp-allow-inline.html` | `script-src 'self' 'unsafe-inline'` | ✓ | ✓ | ✗ | ☐ | ☐ | ☐ | ☐ 待实测 |
| `csp-allow-blob.html` | `script-src 'self' blob:` | ✓ | ✗ | ✓ | ☐ | ☐ | ☐ | ☐ 待实测 |

**P0-T2 验收对照**：
- ① GitHub（CSP 严格站）Method 1 注入成功 → 见第三节 10 站点表 GitHub 行（证明浏览器级注入绕过页面 CSP）。
- ② `csp-strict.html` Method 2 触发 CSP violation 且被捕获上报 → 上表 + 侧栏 violation 详情。☐ 待实测
- ③ Method 3 在 `csp-allow-blob.html` 生效、在 `csp-strict.html` 被禁且可捕获 → 上表。☐ 待实测
- ④ 三种方法经侧栏开关切换后均返回各自执行结果标记（`__luban_poc_method` 分别为 1/2/3）。☐ 待实测

---

## 三、P0-T3 · 10 站点逐站注入验证（数据记录节）

对 PRD §10.3 的 10 个站点逐一执行 Method 1→2→3（可直接用侧栏 **Auto** 模式跑降级链，再单独复测 Method 1 计时）。
每行需记录：命中方法、各 Method 结果、注入耗时（executeScript 前后 `performance.now` 差，侧栏已自动给出）、CSP 响应头摘要、失败站点的 CSP 头原文或报错截图证据。

| # | 站点 | 测试 URL | M1 | M2 | M3 | 命中方法 | 耗时 ms | CSP 头摘要 | 证据（CSP 头原文 / 截图链接） |
|---|------|---------|:--:|:--:|:--:|:-------:|:------:|-----------|------------------------------|
| 1 | 淘宝 | `https://item.taobao.com/item.htm?id=<任一商品>` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 2 | 京东 | `https://item.jd.com/<任一商品>.html` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 3 | 知乎 | `https://www.zhihu.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 4 | 微博 | `https://weibo.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 5 | GitHub | `https://github.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐（Method 1 必须通过） |
| 6 | B 站 | `https://www.bilibili.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 7 | 百度搜索 | `https://www.baidu.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 8 | 豆瓣 | `https://movie.douban.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 9 | 掘金 | `https://juejin.cn/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |
| 10 | V2EX | `https://www.v2ex.com/` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ 待实测 | ☐ |

> 符号约定：✓ = 注入成功（链接变红 + `__luban_poc===true`）；✗ = 失败（附证据）；☐ = 待实测。
> 若某站点需登录才能到目标页，可先测其公开可达页面并在证据列注明。

### 3.1 Method 1 成功率统计

| 指标 | 值 | 目标 | 达标 |
|------|----|------|------|
| Method 1 成功站点数 / 10 | ☐ 待实测 | ≥ 8/10 | ☐ |
| 注入耗时 P50（ms） | ☐ 待实测 | 参考设计 ~12ms | — |
| 注入耗时 P95（ms） | ☐ 待实测 | — | — |
| 失败站点清单 | ☐ 待实测 | — | — |

> P50/P95 计算：把 10 站点 Method 1 的耗时升序排列，P50 取第 5~6 个均值，P95 取第 9~10 个均值。

---

## 四、P0-T4 · Spike 结论与注入策略定稿（结论节）

> 本节在 P0-T3 实测数据回填后据实撰写；以下为需回答的问题骨架与判定规则，请勿在实测前填写结论。

### 4.1 结论

- **默认注入方法**：☐ 待定稿（预期 Method 1 `executeScript({world:'MAIN'})`，须由 §3.1 成功率 ≥ 8/10 支撑）。
- **Method 1 实测成功率**：☐ /10。判定：
  - 若 ≥ 8/10 → 维持技术设计 §3.5 降级链，Method 1 为 MVP 主路径。
  - 若 < 8/10 → **触发升级评审**（开发任务「附：执行说明」#3）：评估引入 manifest 声明式 MAIN world 持久注入作为补充方案，并顺延 Phase 5 工期。此处须附替代方案与工期影响评估：☐ 待填。
- **是否需要 `webNavigation.onCommitted` 时序处理**（风险 #9）：☐ 待定（依据：是否出现「注入早于文档就绪」导致的失败或 `tab was closed` 报错）。

### 4.2 降级链定稿（须与设计 §3.5 逐条对应）

| 优先级 | 方法 | 设计 §3.5 预期 | Spike 实测结论 | 差异标注 |
|--------|------|---------------|---------------|---------|
| 1（主路径） | `executeScript({world:'MAIN'})` | 绕过页面 CSP，~12ms | ☐ 待填 | ☐ |
| 2（降级） | Content Script 注入 `<script>` textContent | 被 `script-src` 无 `unsafe-inline` 阻止 | ☐ 待填 | ☐ |
| 3（降级） | Blob URL `<script src="blob:...">` | 被 `script-src` 无 `blob:` 阻止 | ☐ 待填 | ☐ |
| 4（终止） | 报告「该站点暂不支持」+ 记录受限站点清单 | — | ☐ 待填 | ☐ |

**降级链顺序定稿**：☐ 待定（默认 1→2→3→4；若实测证明 Method 2/3 在真实站点几乎必然被严格 CSP 拦截，可评估「Method 1 失败即直接走 4（暂不支持）」以简化 Phase 5，此处记录决策与理由）。

### 4.3 风险站点清单（已知失败站点 + 正式版行为预期）

| 站点 | 失败方法 | 失败原因（CSP 头 / 报错） | 正式版优雅降级行为预期 |
|------|---------|--------------------------|----------------------|
| ☐ 待填 | ☐ | ☐ | 命中降级链末端 → 侧栏提示「该站点暂不支持自动注入」，不静默失败、不崩溃（对齐 PRD §4.1 / 设计 §四错误处理 CSP 注入失败策略） |

> **决策点确认**（阶段验收门第 4 项）：若某站点 Method 1 失败，正式版是「走降级链」还是「直接暂不支持」？
> 结论：☐ 待定（建议：Method 1 失败后仍按 2→3 尝试一次；若严格 CSP 站 2/3 实测恒失败，则直接 4「暂不支持」，避免无谓重试——最终由 §4.2 实测定）。

---

## 五、阶段验收门（Phase 0 退出标准）

- [ ] 10/10 站点测试记录完整（含 CSP 证据），无跳过项
- [ ] Method 1 成功率 ≥ 8/10（PRD §10.3 #2 前置保障）
- [ ] 注入策略定稿文档（本文档 §四）完成，Phase 5 可直接引用
- [ ] 决策点确认：Method 1 失败站点走降级链还是「暂不支持」已定

---

## 附：Spike 代码与本文档的对应关系

| 文件 | 作用 | 对应任务 |
|------|------|---------|
| `spike/manifest.json` | 最小 MV3（storage/activeTab/scripting/sidePanel，无 content_scripts） | P0-T1 |
| `spike/background.js` | SW 编排：Method 1 直注入、降级链调度、计时、CSP 头抓取、错误捕获、toast、结果落库 | P0-T1 / P0-T2 |
| `spike/content.js` | ISOLATED 注入器：Method 2（textContent）/ Method 3（Blob URL）+ `securitypolicyviolation` 捕获 | P0-T2 |
| `spike/panel.html` / `panel.js` | 侧栏「后台开关」：切换方法、查看命中/耗时/CSP/violation、一键复制 JSON | P0-T2 ④ |
| `spike/fixtures/*.html` + `csp-reporter.js` | 自建 CSP 测试页（strict / allow-inline / allow-blob / no-csp）+ violation 可视化 | P0-T2 ②③ |
| `docs/spike-injection-results.md`（本文件） | 数据记录节（§三）+ 结论节（§四） | P0-T3 / P0-T4 |
