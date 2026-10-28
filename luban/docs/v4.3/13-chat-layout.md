# 聊天底部配置工具栏调整

日期：2026-10-21。依据用户提供的输入框/底部模型工具栏参考。

## 范围与实施

- 顶部只保留网页上下文、新建和工具列表；移除顶部设置入口。
- 执行方选择移至输入框下方，以当前模型名称和轻量图标展示；本地Codex沿用账号默认模型。
- 模型设置、连接与偏好集中于底部，旧版推理选项亦位于底部。未新增后端不支持的推理开关或虚假连接状态。
- 连接面板从底部向上展开；Esc/点击外部关闭，Esc恢复触发按钮焦点。
- 输入框圆角、焦点环、发送状态及底部控件统一；减少配置切换造成的聊天消息干扰。
- 目标范围确认仍是独立决策，保留在输入区附近；生成、运行、保存授权规则不变。

## 验收与复核

- TypeScript和生产构建通过；相关21项测试通过，补充了配置顺序、无顶部设置、Esc焦点恢复和输入保留断言；类型修正后统一聊天测试再次通过。
- 真实扩展临时浏览器5项通过：320/390宽度无横向溢出、配置位于输入后；切换执行方保留未发送输入；设置锚定底部；Esc关闭恢复焦点。
- [原始浏览器结果](evidence/chat-layout.json)、[默认界面](evidence/chat-bottom-toolbar.png)、[连接与偏好](evidence/chat-bottom-settings.png)。
- 未运行模型或试运行脚本；本轮属于布局和配置入口调整，没有把旧版完整发布验收重新标成通过。

复现入口：`scripts/verify-v43-chat-layout.mjs`，沿用第12份文档中的测试浏览器环境变量。重载扩展构建后查看实际效果。

## 按截图进一步精简

移除V4聊天的整个顶部网页/新建/工具列表栏、输入框下方的模型与授权说明、“连接与偏好”文字入口。底部只保留模型选择与图标设置；设置图标承接原有偏好面板，窄屏仍可访问。生成/运行/保存的实际授权门禁保留。

## Thinking 开关

- 底部增加灯泡图标、Thinking文字与开关，保存已有全局thinkingEnabled偏好，作用于后续请求；切换不发送消息、不改变未发送输入。
- V4配置通过现有thinkingParameters策略解析端点支持后，经SW→Bridge严格schema→Harness模型适配器传递`thinking.type=enabled/disabled`。未配置支持的自定义端点不附加厂商参数，开关禁用并说明原因。
- 本地Codex沿用自身模型推理，开关禁用并提示。未把API开关假装作用于Codex。
- Bridge声明thinkingConfiguration=1；旧驻留宿主缺少能力时明确要求更新/重启，不悄悄忽略用户选择。安装包已重新生成，正式注册未修改。
- 扩展定向7项、Harness9项、Bridge4项通过；类型/构建/lint通过。Harness本机HTTP测试验证enabled、disabled和无参数三种真实请求体。
- [底部浏览器7项](evidence/chat-layout.json)通过，含关闭状态保存和Codex禁用；[Native专项15项](evidence/native-e2e-thinking.json)通过，实际模型接口先收到disabled、再收到enabled，同时回归独立生成/运行/保存门禁。使用本地协议模型，不声明供应商模型内部推理效果或质量提升。

### Thinking 图标精简

仅保留灯泡图标：开启时暖金色点亮，关闭时灰色变暗；不可用时进一步降低亮度。移除文字和滑轨，保留title提示、switch语义、aria-checked及键盘焦点样式。只改呈现，不改变已验证的配置传递。

## 模型选择面板

原生select替换为底部向上展开的模型面板：当前模型与本地Codex分项展示，配有简短说明、选中标记，以及模型管理入口。使用现有执行方存储，不扩展模型清单或改变生成/执行授权。

支持上下方向键/Home/End、Esc返回触发按钮、点击外部/焦点移出关闭；异步切换失败保留面板内错误，未发送内容保留。切换处理期间禁止重复提交。类型、构建、lint及统一聊天回归通过；真实浏览器结果见chat-layout.json，面板截图见chat-model-picker.png。

## 工具栏点击直接打开侧栏

移除manifest的action.default_popup。初始化先准备各tab独立侧栏路径，再启用Chrome原生openPanelOnActionClick；启动/安装本身不自动打开窗口，也不退回全窗口共享会话。更新页面权限提示，移除“再点在当前页打开”的旧步骤。

侧栏准备和统一聊天4项回归、类型、构建、lint通过。真实浏览器核对无default_popup、openPanelOnActionClick=true，以及tab专属enabled/path；结果见chat-layout.json。未在无界面测试中模拟物理工具栏点击。重载扩展后由Chrome处理实际工具栏手势。

### 工具栏授权回归修正

上述内置openPanelOnActionClick=true方案在无预授网页权限时未触发activeTab授权，已废弃。现保持无popup，改由action.onClicked同步打开tab侧栏；详见[14-active-tab-regression.md](14-active-tab-regression.md)，含有效复现与修复后证据。
