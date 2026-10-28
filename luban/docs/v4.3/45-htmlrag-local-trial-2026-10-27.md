# 官方 HtmlRAG 本地块树检索试用版

## 接入决策与计划

用户明确要求使用 HtmlRAG 再优化一版。采用官方 PyPI 包 htmlrag==0.1.1 的 clean_html、build_block_tree、BM25HTMLPruner.calculate_block_rankings 与 prune_HTML；不是将已有 JavaScript 结构增强换名为 HtmlRAG。

本轮选择官方文档支持的 BM25 块树剪枝路线，不加载 EmbedHTMLPruner 或 GenHTMLPruner，不下载嵌入/1B/3.8B 权重。语义判定继续由现有模型完成。该路线仍使用词法排名，不能声称新增了神经语义召回或完整复现论文两阶段神经剪枝。

官方依据：
- [HtmlRAG 项目](https://github.com/plageon/HtmlRAG)
- [工具包文档及 BM25HTMLPruner 示例](https://github.com/plageon/HtmlRAG/blob/main/toolkit/README.md)
- [官方剪枝实现](https://github.com/plageon/HtmlRAG/blob/main/toolkit/htmlrag/pruner.py)

## 实施

1. 页面提供已有授权范围内的有界 DOM 投影：保留已登记观察块的相对父子层级、真实引用和有限文本；最多 240 块，不是原始整页 outerHTML。HTML 投影上限 24 KB，连同观察块一起受页面证据总大小限制。脚本、输入值、隐藏属性内容、鲁班 UI 不进入投影；不读取 iframe/Shadow DOM 内部。页面文本中的伪引用标记会被消除，真实标记由采集器添加。
2. 本地 Python 常驻进程调用官方 HtmlRAG 清洗与块树切分。针对其默认空白分词的 BM25 路线，为评分副本增加通用中英文字符/词分割；原始结构文本不被分词改写。
3. 从实际块树中召回候选块，保留有限路径，再调用官方 prune_HTML 压缩上下文。预算使用明确的字符单位（4096），不是声称按供应商 token 精确计费。只输出原投影真实引用；额外上下文的标记降为 CONTEXT_ONLY，不能凭上下文产生可操作引用。
4. 返回排名候选摘要与 HTML 结构上下文；内部 readLimit 批量读取、节点身份、自动 inspect/review、用户范围确认和独立生成/运行/保存流程继续沿用。HtmlRAG 结果本身不是已读事实，不直接赋予目标权限。
5. 新增实际引擎、包版本、剪枝耗时、块数、上下文字符数、投影截断与回退原因元数据。界面明确显示 HtmlRAG 或“BM25（HtmlRAG 已回退）”。记录的结构处理毫秒数不代表模型或整个任务总耗时。
6. 预热常驻进程，避免每次工具调用重载 Python/Torch。处理超时、缺运行时、缺投影或剪枝失败时有界回退旧 BM25，并如实记录；不能把回退列为 HtmlRAG 成功。准备脚本和锁文件可重建依赖。

## 安装与部署边界

本机项目隔离环境 bridge/.local/htmlrag-venv，依赖锁为 bridge/requirements-htmlrag.lock。安装依赖约 903 MB（含官方包声明的 Torch/Transformers 等依赖），没有模型权重。它是本机前置运行时，不塞入 Chrome 扩展，也不将虚拟环境计入 Git 或自动复制进发布包。

发布包携带适配代码、官方依赖锁与 prepare-htmlrag.mjs。当前项目的源代码/发布包均可找到同一项目隔离运行时；其他机器需先准备 Python 3.12/uv 并运行安装脚本，缺依赖会显式回退。

Bridge 状态目录 htmlrag.json 的 mode=htmlrag-bm25 开启试用；原 BM25 保留用于对照/回退。htmlrag-status.json 仅记录状态、版本、预热毫秒和进程号等非敏感信息。版本仍为 0.4.3，页面新投影和引擎指示需要重新加载扩展并刷新目标页。

## 验收设计与已知结果

- 四个合成检索用例：中文嵌套区域、可访问名称控件、60 模块末尾目标、无匹配。实际加载官方 HtmlRAG，不允许用静默回退冒充成功。
- 两种方案四例均达到预期；暂无准确率提升证据。多模块用例排名返回 2503 → 799 字节，减少约 68%；简单用例由于结构上下文和元数据，返回反而略有增加。
- 本地第一次评分包含 BM25 依赖懒加载，约 253 ms；后续小例约 1 ms，多模块约 9 ms。这些是合成数据的本地检索处理时间，不是业务页面/模型服务时延。
- 真实 Chrome + Native Messaging + 实际 Worker 前后对照另存本目录 evidence/2026-10-27/htmlrag，下列最终验收记录填写实际结果。

## 风险与后续

本轮投影仍受原采样范围限制，HtmlRAG 无法恢复未采集节点、隐藏帧或完整业务目标；剪枝也可能损失有用语境，必须如实保留覆盖缺口。首次加载依赖在本机曾约 23 秒，随后受系统缓存影响；预热成本要单独计入启动评估。

若真实页面未体现收益，不以合成用例宣传效果，也不强制扩大自动尝试或绕过确认。后续若要评估神经嵌入/生成式剪枝，需要另行配置模型、实测资源与查询延迟，不能用本轮的 BM25 路线结论代替。

## 最终浏览器对照

两组输入共用相同的通用地标保留采样。原均匀采样在收紧预算时可能漏掉侧栏等根节点，现优先保留通用地标及主标题，再采样其余节点；该改动同样用于 BM25 基线，不计为 HtmlRAG 单独收益。

- BM25 25 项、实际 HtmlRAG 27 项浏览器检查通过；HtmlRAG 模式明确断言官方运行时就绪且真实检索没有回退。
- 两种方案识别和修改分析均各 2 次模型调用，没有额外下降。
- 两次检索工具的完整返回合计 13,596 → 12,892 UTF-8 字节，下降约 5.18%；这是工具返回文本量，不是供应商 token 或总耗时。
- HtmlRAG 预热约 4.1 秒；该次浏览器首轮本地处理 490 ms、后续约 27 ms。没有总任务加速或语义准确率提升的证据，当前收益有限。
- 549 项扩展测试、125 项 Bridge 测试通过，构建完成。一次与其他测试并行时，既有大 DOM 保留检查超时；单 worker 完整重跑通过。
- [对照记录](evidence/2026-10-27/htmlrag/comparison.json)、[四个结构检索用例](evidence/2026-10-27/htmlrag/retrieval-cases.json)、[实际 HtmlRAG 浏览器链路](evidence/2026-10-27/htmlrag/optimized/native-dom.json)。

本机试用模式的启用、后台空闲检查与实际预热状态见 [部署记录](evidence/2026-10-27/htmlrag/deployment.json)。重新加载扩展并刷新目标页后，方能提供新 HTML 投影；否则会如实回退旧 BM25，而不是拒绝旧请求。
