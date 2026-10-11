// 5 层错误模型 + 错误工厂（对齐技术设计 §四）。
// 原则：每个错误至少携带一个 ErrorAction，UI 据此渲染恢复按钮，确保「任何错误不静默失败」。

/** 错误所在层（每层独立前缀）。 */
export enum ErrorLayer {
  CAPTURE = 'CAP', // 采集层
  NETWORK = 'NET', // 传输层
  MODEL = 'MOD', // 模型层
  INJECT = 'INJ', // 注入层
  RUNTIME = 'RUN', // 运行层
}

/** 可执行的恢复动作（§四）。 */
export type ErrorAction =
  | { type: 'RETRY' }
  | { type: 'EDIT_INTENT' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'REGENERATE'; withError: string }
  | { type: 'DISMISS' };

/**
 * 鲁班统一错误。code 形如 `MOD_TIMEOUT`（层前缀 + 场景）。
 * userMessage 为中文可读文案（来自 i18n-strings）。
 */
export class LubanError extends Error {
  constructor(
    public readonly layer: ErrorLayer,
    public readonly code: string,
    public readonly userMessage: string,
    public readonly actions: ErrorAction[],
    public readonly cause?: Error,
  ) {
    super(userMessage);
    this.name = 'LubanError';
    // 保证 instanceof 在 downlevel 目标下仍可用
    Object.setPrototypeOf(this, LubanError.prototype);
  }

  /** 跨上下文可序列化投影（chrome 消息不可传 Error 实例）。 */
  serialize(): SerializedError {
    return {
      layer: this.layer,
      code: this.code,
      message: this.userMessage,
      actions: this.actions,
      cause: this.cause ? String(this.cause.message ?? this.cause) : undefined,
    };
  }

  static fromSerialized(e: SerializedError): LubanError {
    return new LubanError(e.layer, e.code, e.message, e.actions ?? []);
  }
}

/** SerializedError —— 消息协议中传输的错误结构。 */
export interface SerializedError {
  layer: ErrorLayer;
  code: string;
  message: string;
  actions: ErrorAction[];
  cause?: string;
}

/** 便捷工厂：构造带单层前缀与默认动作的错误。 */
export function makeError(
  layer: ErrorLayer,
  scenario: string,
  userMessage: string,
  actions: ErrorAction[],
  cause?: Error,
): LubanError {
  return new LubanError(layer, `${layer}_${scenario}`, userMessage, actions, cause);
}

/** 常见错误工厂（§四 表格场景，文案随 Phase 3 接入 i18n 引用）。 */
export const ErrorFactory = {
  networkTimeout: (cause?: Error): LubanError =>
    makeError(ErrorLayer.NETWORK, 'TIMEOUT', '网络较慢，请求超时了。', [{ type: 'RETRY' }], cause),
  keyInvalid: (): LubanError =>
    makeError(ErrorLayer.NETWORK, 'KEY_INVALID', 'API Key 无效，请检查设置。', [
      { type: 'OPEN_SETTINGS' },
      { type: 'DISMISS' },
    ]),
  keyExpired: (): LubanError =>
    makeError(ErrorLayer.NETWORK, 'KEY_EXPIRED', 'API Key 已过期或权限不足。', [{ type: 'OPEN_SETTINGS' }]),
  rateLimited: (): LubanError =>
    makeError(ErrorLayer.NETWORK, 'RATE_LIMITED', '调用太频繁，稍等片刻后重试。', [{ type: 'RETRY' }]),
  modelBadJson: (): LubanError =>
    makeError(ErrorLayer.MODEL, 'BAD_JSON', '模型返回格式异常，已尝试重来。', [
      { type: 'REGENERATE', withError: '上次输出不是合法 JSON，必须输出纯 JSON' },
      { type: 'EDIT_INTENT' },
    ]),
  injectionBlockedByCsp: (): LubanError =>
    makeError(ErrorLayer.INJECT, 'CSP_BLOCKED', '该页面的安全策略（CSP）阻止了脚本注入。', [
      { type: 'REGENERATE', withError: '' },
      { type: 'DISMISS' },
    ]),
  injectionUnsupported: (): LubanError =>
    makeError(ErrorLayer.INJECT, 'UNSUPPORTED_SITE', '该站点暂不支持脚本注入。', [{ type: 'DISMISS' }]),
  runtimeError: (detail: string): LubanError =>
    makeError(ErrorLayer.RUNTIME, 'SCRIPT_ERROR', '脚本运行时出错。', [
      { type: 'REGENERATE', withError: detail },
      { type: 'DISMISS' },
    ]),
  cancelled: (): LubanError =>
    makeError(ErrorLayer.NETWORK, 'CANCELLED', '已取消。', [{ type: 'DISMISS' }]),
  captureRestrictedPage: (): LubanError =>
    makeError(ErrorLayer.CAPTURE, 'RESTRICTED_PAGE', '当前页面无法采集内容（浏览器限制）。', [
      { type: 'DISMISS' },
    ]),
};
