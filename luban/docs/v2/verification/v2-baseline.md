# V2 P0 基线

日期：2026-10-13，Asia/Shanghai。基线 HEAD：`4c66b72851781348c3321ac4cee1420376b1c1f9`。工作区包含已有未提交变更，不能仅以 HEAD 复现；完整源文件摘要见 [SHA-256](./evidence/baseline-sha256.json)，状态见 [git status](./evidence/baseline-git-status.txt)。

## 工程检查（探针修改之前）

| 检查 | 结果 | 证据 |
|---|---|---|
| npm test | 15 文件、161 测试通过 | [日志](./evidence/baseline-test.txt) |
| npm run typecheck | 退出 0 | [日志](./evidence/baseline-typecheck.txt) |
| npm run lint | 退出 0 | [日志](./evidence/baseline-lint.txt) |
| npm run build | 退出 0 | [日志](./evidence/baseline-build.txt) |

Node v24.14.1，npm 11.11.0。当前测试和构建无失败。既有源码修改包括 i18n-strings、IdleView、IntentView；文档从旧位置迁移为 v1/v2，保留这些变更，不重置。

## 浏览器环境

通过原生 computer use 的 chrome://version 读取：Google Chrome 155.0.8059.40 Official Build arm64，macOS 26.6.2，V8 15.5.35.20。浏览器已有鲁班正式扩展，探针另建独立扩展，不复用其数据库或模型配置。

当前 Chrome 有用户既存命令行参数（包括 LocalNetworkAccessChecks disabled）；测试不会修改这些参数。结果限于这个配置，不代表全默认浏览器配置已验证。Chrome 138 尚无验证环境，兼容性不得标通过。

## P0 改动边界

新增 `luban/spike-v2/` 和本目录证据；不改正式 src/、生产 manifest 或 package lock。探针不进入 dist；只请求 http://localhost/*。语法检查独立执行，不以正式 npm test 覆盖探针真实 Chrome 行为。
