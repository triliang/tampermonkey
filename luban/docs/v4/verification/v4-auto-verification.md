# V4 自动验收记录

执行时间：2026-10-19 11:52:15（Asia/Shanghai）。脚本：`node luban/scripts/verify-v4.mjs --package`。

| 检查 | 结果 | 耗时 ms | 退出码 | 证据 |
|---|---|---:|---|---|
| generic-boundary | 通过 | 35 | 0 | [输出](./evidence/generic-boundary.txt) |
| harness-build | 通过 | 570 | 0 | [输出](./evidence/harness-build.txt) |
| harness-typecheck | 通过 | 287 | 0 | [输出](./evidence/harness-typecheck.txt) |
| harness-tests | 通过 | 910 | 0 | [输出](./evidence/harness-tests.txt) |
| bridge-syntax | 通过 | 1968 | 0 | [输出](./evidence/bridge-syntax.txt) |
| bridge-tests | 通过 | 4982 | 0 | [输出](./evidence/bridge-tests.txt) |
| extension-typecheck | 通过 | 2019 | 0 | [输出](./evidence/extension-typecheck.txt) |
| extension-lint | 通过 | 2085 | 0 | [输出](./evidence/extension-lint.txt) |
| extension-tests | 通过 | 9638 | 0 | [输出](./evidence/extension-tests.txt) |
| extension-build | 通过 | 2136 | 0 | [输出](./evidence/extension-build.txt) |
| bridge-package | 通过 | 9360 | 0 | [输出](./evidence/bridge-package.txt) |
| bridge-package-smoke | 通过 | 11105 | 0 | [输出](./evidence/bridge-package-smoke.txt) |

这些结果只代表所列本地自动检查。Bridge 测试使用本机协议模型，不代表真实远程模型或已安装 Chrome 扩展验收。
