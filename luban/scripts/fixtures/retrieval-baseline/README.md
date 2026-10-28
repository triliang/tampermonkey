# 冻结对照基线

冻结于 2026-10-27，本轮结构增强和批量读取修改之前的工作区版本（包含上一轮预算收敛修复，不等同 Git HEAD）。

- `dom-observations.ts`：原有采集，只有 import 路径调整以便独立打包。
- `lexical-search.mjs`：原有结构字段词法 BM25，无新增层级摘要、容器去重。
- `runtime.ts`：原有 Agent 工具与提示词，保留 8/24/120 预算和分阶段收尾，未暴露批量工具；对照脚本只转译并重定位本地导入，使用相同 SDK 和模型适配器。

仅用于对照，不是生产入口。来源 SHA-256 记录在 `docs/v4.3/evidence/2026-10-27/structured-bm25/model-comparison.json`。运行入口 `scripts/compare-v43-structured-retrieval.mjs`；默认仅浏览器检索，`--live` 才调用已登录模型。模型默认版本未固定，真实模型样本小，不作泛化承诺。原始金标写在 `../structured-retrieval-cases.mjs`，均为自建合成页面，不读取用户页面。
