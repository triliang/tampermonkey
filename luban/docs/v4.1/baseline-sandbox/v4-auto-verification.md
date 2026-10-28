# V4 自动验收记录

执行时间：2026-10-19 12:00:59（Asia/Shanghai）。脚本：`node luban/scripts/verify-v4.mjs`。

| 检查 | 结果 | 耗时 ms | 退出码 | 证据 |
|---|---|---:|---|---|
| generic-boundary | 通过 | 27 | 0 | [输出](./evidence/generic-boundary.txt) |
| harness-build | 通过 | 371 | 0 | [输出](./evidence/harness-build.txt) |
| harness-typecheck | 通过 | 260 | 0 | [输出](./evidence/harness-typecheck.txt) |
| harness-tests | 通过 | 831 | 0 | [输出](./evidence/harness-tests.txt) |
| bridge-syntax | 通过 | 1951 | 0 | [输出](./evidence/bridge-syntax.txt) |
| bridge-tests | 失败 | 3389 | 1 | [输出](./evidence/bridge-tests.txt) |
| extension-typecheck | 通过 | 1737 | 0 | [输出](./evidence/extension-typecheck.txt) |
| extension-lint | 通过 | 1809 | 0 | [输出](./evidence/extension-lint.txt) |
| extension-tests | 通过 | 7985 | 0 | [输出](./evidence/extension-tests.txt) |
| extension-build | 通过 | 2047 | 0 | [输出](./evidence/extension-build.txt) |

这些结果只代表所列本地自动检查。Bridge 测试使用本机协议模型，不代表真实远程模型或已安装 Chrome 扩展验收。
