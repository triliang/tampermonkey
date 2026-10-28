# 扩展版本同步

日期：2026-10-27。

计划与实现：按用户要求将 Chrome 扩展展示版本从 0.1.0 调整为 0.4.3，同步 manifest.json、package.json、package-lock.json 顶层和根包版本。把 Vx.y → 0.x.y 的阶段对应关系写入 AGENTS.md 和项目 .cursor/rules/luban-version.mdc；内部包、协议、数据库版本独立管理。

验收与复核：扩展类型检查与生产构建通过；源码 manifest、package、lock 两处及 dist manifest 的版本均核对为 0.4.3。未修改依赖、内部协议或历史验收证据。未重载日常 Chrome，重新加载扩展后版本显示才更新。
