# 根因与实施

## 诊断

实际只读 Native health：注册目录包版本 0.6.5，常驻进程版本 0.6.4，协议版本仍同为 1。旧 Harness 配置仅允许 baseUrl/model/apiKey，strict schema 会拒绝新增的 backend/conversationId 字段，ZodError 被转换为 INVALID_REQUEST。

旧常驻 PID 80700 经精确命令核验属于已注册的 Luban Bridge；只读查询时外部运行/排队任务 0，Harness 运行任务 0。未查询任务正文和账号凭据。

## 修改

- Harness status 新增 configurationVersion=2 与 modelBackends=['api','codex']。
- 扩展在发送模型配置、加载 API 凭据之前确认配置协议和后端能力。老服务不再收到不支持的配置，也不会静默降级或切换模型。
- 对缺失能力显示“重启 Bridge 并重新连接”的明确说明；INVALID_REQUEST 保留诊断代码，但展示可操作中文提示。
- 新版 Bridge 0.6.6；配置结构不变，兼容已加载的 0.6.5 扩展。

这次问题是安装包与内存进程不一致，不属于模型推理或站点逻辑。配对凭据和会话数据不删除、不重新生成。
