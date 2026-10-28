export const HARNESS_ERROR_MESSAGES:Record<string,string>={
 GENERIC_REVIEW_REQUIRED:'通用程序候选仅供审阅，受控运行和效果验证尚未接入，暂不可应用、运行或保存。',
 HARNESS_CONVERSATION_MISSING:'会话引用已失效；请重试以恢复原工作区聊天，输入和草稿保留。',
 HARNESS_CONFIRMATION_RESET:'会话已恢复。请重新授权页面并确认目标与方案，再继续此操作。',
 HARNESS_BRIDGE_UPGRADE_REQUIRED:'当前运行的 Bridge 尚不支持新版模型配置。请重启本机 Bridge 并重新连接，配对和聊天记录会保留。',
 HARNESS_MODEL_CODEX_UNAVAILABLE:'未找到可用的本地 Codex，请检查桌面应用安装。',
 HARNESS_MODEL_CODEX_INCOMPATIBLE:'本地 Codex 协议或限制能力不兼容，请检查 Bridge 与 Codex 版本。',
 HARNESS_MODEL_TOOL_DENIED:'模型请求了未授权能力，已停止本次处理。',
 HARNESS_MODEL_AUTH_UNAVAILABLE:'暂时无法确认 Codex 账号连接，请检查 Codex 登录及网络后重试。',
 HARNESS_MODEL_BUDGET:'本轮模型调用已达到上限，完整分析尚未完成。',HARNESS_MODEL_NO_PROGRESS:'分析没有获得新证据，已停止重复尝试。',HARNESS_MODEL_EVIDENCE_TIMEOUT:'页面证据请求超时，请核对页面与连接状态。',HARNESS_MODEL_AUTH:'模型认证失败，请检查登录或模型设置。',
 HARNESS_MODEL_TOOL_BUDGET:'本轮页面工具调用已达到上限，已有结果保留。',
 HARNESS_MODEL_DEADLINE:'本轮分析已达到总时限，已有结果保留；请缩小范围后重试。',
 HARNESS_MODEL_TIMEOUT:'模型请求超时，请检查模型服务或网络后重试。',
 HARNESS_MODEL_RATE_LIMIT:'模型服务限流，请稍后重试。',
 HARNESS_MODEL_REQUEST_REJECTED:'模型服务拒绝请求，请检查模型与结构化输出兼容性。',
 HARNESS_MODEL_OUTPUT_INVALID:'模型输出格式不符合规范，请重试。',
};
export const harnessErrorMessage=(code:string)=>HARNESS_ERROR_MESSAGES[code]??code;
