# V4.1 本地自动验收

命令：`npm --prefix luban run verify:v41`。不调用模型，不启动 Chrome。

| 检查 | 通过 | 耗时 ms |
|---|---|---:|
| local-scenarios | true | 779 |
| boundary | true | 26 |
| runner-syntax | true | 22 |
| existing-config-syntax | true | 27 |

日志与文件哈希见本目录。jsdom 模拟尺寸不代表真实渲染验收；本记录不含真实模型。
