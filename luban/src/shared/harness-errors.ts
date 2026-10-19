export const HARNESS_ERROR_MESSAGES:Record<string,string>={
 HARNESS_CONVERSATION_MISSING:'会话引用已失效；请重试以恢复原工作区聊天，输入和草稿保留。',
 HARNESS_CONFIRMATION_RESET:'会话已恢复。请重新授权页面并确认目标与方案，再继续此操作。',
 HARNESS_BRIDGE_UPGRADE_REQUIRED:'当前运行的 Bridge 尚不支持新版模型配置。请重启本机 Bridge 并重新连接，配对和聊天记录会保留。',
 HARNESS_MODEL_CODEX_UNAVAILABLE:'未找到可用的本地 Codex，请检查桌面应用安装。',
 HARNESS_MODEL_CODEX_INCOMPATIBLE:'本地 Codex 协议或限制能力不兼容，请检查 Bridge 与 Codex 版本。',
 HARNESS_MODEL_TOOL_DENIED:'模型请求了未授权能力，已停止本次处理。',
 HARNESS_MODEL_AUTH_UNAVAILABLE:'暂时无法确认 Codex 账号连接，请检查 Codex 登录及网络后重试。',
 HARNESS_MODEL_AUTH:'模型认证失败，请检查登录或模型设置。',
 HARNESS_MODEL_TIMEOUT:'模型请求超时，请稍后重试；生成失败需重新授权。',
 HARNESS_MODEL_RATE_LIMIT:'模型服务限流，请稍后重试。',
 HARNESS_MODEL_REQUEST_REJECTED:'模型服务拒绝请求，请检查模型与结构化输出兼容性。',
 HARNESS_MODEL_OUTPUT_INVALID:'模型输出格式不符合规范，请重试；生成失败需重新授权。',
};
export const harnessErrorMessage=(code:string)=>HARNESS_ERROR_MESSAGES[code]??code;
