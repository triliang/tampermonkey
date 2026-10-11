// 消息协议：所有跨上下文通信以 type-safe 判别联合约束，消除魔法字符串（§3.1）。
// 仅类型 + 少量构造辅助，零业务运行时。

import type { GenerationResult, InjectionMethod, InjectionResult, PageContext, ProviderConfig, UiSnapshot, UserScript } from './types';
import type { SerializedError } from './errors';

/** 消息类型（§3.1 全量 + PING/PONG 内部链路自检）。 */
export type MessageType =
  | 'START_PICKER' // SidePanel → SW → Content: 启动元素选择
  | 'COLLECT_PAGE_CONTEXT' // SidePanel → SW → Content: 整页上下文采集（不启动选择器）
  | 'CANCEL_PICKER' // SidePanel → SW → Content: 主动取消元素选择（停止监听与高亮）
  | 'ELEMENT_PICKED' // Content → SW → SidePanel: 元素已选中 + 上下文
  | 'PICK_CANCELLED' // Content → SidePanel: 页面内 Esc 取消选择，广播同步 UI 状态
  | 'GENERATE_SCRIPT' // SidePanel → SW: 请求 AI 生成
  | 'GENERATION_PROGRESS' // SW → SidePanel (via Port): 流式 delta
  | 'GENERATION_COMPLETE' // SW → SidePanel: 生成完成
  | 'GENERATION_FAILED' // SW → SidePanel: 生成失败
  | 'INJECT_SCRIPT' // SidePanel → SW: 请求运行脚本（SW 内部按降级链调度 Method 1-4，不再转发原始类型名）
  | 'INJECT_VIA_SCRIPT_TAG' // SW → Content: Method 2/3 降级注入（script 标签 / Blob URL）
  | 'INJECTION_RESULT' // Content → SW → SidePanel: 注入结果
  | 'SAVE_SCRIPT' // SidePanel → SW: 保存脚本
  | 'RUN_SAVED_SCRIPT' // Options / SidePanel → SW: 运行已保存脚本
  | 'LIST_SCRIPTS' // SidePanel / Options → SW: 脚本索引
  | 'DELETE_SCRIPT' // Options → SW: 删除脚本
  | 'GET_STATE' // SidePanel → SW: 读取 session 中的 UI 快照
  | 'SET_UI_STATE' // SidePanel → SW: 写入 / 清除 UI 快照
  | 'SHOW_TOAST' // SW → Content: 页面右下角提示
  | 'FOCUS_PANEL' // Content → SW: 点击 Toast 后聚焦侧栏
  | 'CANCEL_GENERATION' // SidePanel → SW: 取消生成
  | 'TEST_CONNECTION' // Options → SW: 测试 AI Provider 连通性
  | 'PING' // 链路自检：请求可达性
  | 'PONG'; // 链路自检：应答

/** 每条请求消息携带 requestId，用于异步回调与请求-响应关联（§3.7）。 */
interface BaseMessage {
  requestId: string;
}

export interface StartPickerMsg extends BaseMessage {
  type: 'START_PICKER';
}
export interface CollectPageContextMsg extends BaseMessage {
  type: 'COLLECT_PAGE_CONTEXT';
}
export interface CancelPickerMsg extends BaseMessage {
  type: 'CANCEL_PICKER';
}
export interface ElementPickedMsg extends BaseMessage {
  type: 'ELEMENT_PICKED';
  context: PageContext;
}
export interface PickCancelledMsg extends BaseMessage {
  type: 'PICK_CANCELLED';
}
/** 重新生成时携带的失败/改进上下文（§P4-T4）：让 AI 看到上一轮产出，避免用户重复输入。 */
export interface RegenerateContext {
  previousCode: string;
  previousWarnings: string[];
  extraRequirement?: string;
}
export interface GenerateScriptMsg extends BaseMessage {
  type: 'GENERATE_SCRIPT';
  context: PageContext;
  intent: string;
  regenerateContext?: RegenerateContext;
}
export interface GenerationProgressMsg extends BaseMessage {
  type: 'GENERATION_PROGRESS';
  /** 累计原始流文本 */
  content: string;
  done: boolean;
}
export interface GenerationCompleteMsg extends BaseMessage {
  type: 'GENERATION_COMPLETE';
  result: GenerationResult;
}
export interface GenerationFailedMsg extends BaseMessage {
  type: 'GENERATION_FAILED';
  error: SerializedError;
}
export interface InjectScriptMsg extends BaseMessage {
  type: 'INJECT_SCRIPT';
  code: string;
  gmGrants: string[];
  /** 注入前预加载的 GM_* 存储快照（§3.6）。有 scriptId 时由 SW 改读 luban:gm:{id}。 */
  storageSnapshot: Record<string, unknown>;
  /** 已保存脚本的 id；存在时运行后把 dirty 回写 GM 存储 */
  scriptId?: string;
}
export interface InjectViaScriptTagMsg extends BaseMessage {
  type: 'INJECT_VIA_SCRIPT_TAG';
  code: string;
  method: Extract<InjectionMethod, 2 | 3>;
  gmGrants: string[];
  storageSnapshot: Record<string, unknown>;
}
export interface InjectionResultMsg extends BaseMessage {
  type: 'INJECTION_RESULT';
  result: InjectionResult;
}
export interface SaveScriptMsg extends BaseMessage {
  type: 'SAVE_SCRIPT';
  script: UserScript;
}
export interface RunSavedScriptMsg extends BaseMessage {
  type: 'RUN_SAVED_SCRIPT';
  scriptId: string;
}
export interface ListScriptsMsg extends BaseMessage {
  type: 'LIST_SCRIPTS';
}
export interface DeleteScriptMsg extends BaseMessage {
  type: 'DELETE_SCRIPT';
  scriptId: string;
}
export interface GetStateMsg extends BaseMessage {
  type: 'GET_STATE';
}
export interface SetUiStateMsg extends BaseMessage {
  type: 'SET_UI_STATE';
  snapshot: UiSnapshot | null;
  /** 本次写入的时间。比已落地的更旧则丢弃，避免生成结束后的清空被迟到的快照覆盖 */
  updatedAt: number;
}
export interface ShowToastMsg extends BaseMessage {
  type: 'SHOW_TOAST';
  text: string;
}
export interface FocusPanelMsg extends BaseMessage {
  type: 'FOCUS_PANEL';
}
export interface CancelGenerationMsg extends BaseMessage {
  type: 'CANCEL_GENERATION';
}
export interface TestConnectionMsg extends BaseMessage {
  type: 'TEST_CONNECTION';
  config: ProviderConfig;
}
export interface PingMsg extends BaseMessage {
  type: 'PING';
  /** 由谁发起自检，用于日志 */
  from: 'sw' | 'content' | 'main';
  /** 期望应答的上下文（SW 据此决定注入/中继策略） */
  to: 'content' | 'main';
}
export interface PongMsg extends BaseMessage {
  type: 'PONG';
  /** 应答方标识，证明该上下文已就绪 */
  from: 'sw' | 'content' | 'main';
}

/** 全消息判别联合（发送端使用）。 */
export type LubanMessage =
  | StartPickerMsg
  | CollectPageContextMsg
  | CancelPickerMsg
  | ElementPickedMsg
  | PickCancelledMsg
  | GenerateScriptMsg
  | GenerationProgressMsg
  | GenerationCompleteMsg
  | GenerationFailedMsg
  | InjectScriptMsg
  | InjectViaScriptTagMsg
  | InjectionResultMsg
  | SaveScriptMsg
  | RunSavedScriptMsg
  | ListScriptsMsg
  | DeleteScriptMsg
  | GetStateMsg
  | SetUiStateMsg
  | ShowToastMsg
  | FocusPanelMsg
  | CancelGenerationMsg
  | TestConnectionMsg
  | PingMsg
  | PongMsg;

/** 统一响应封装（sendMessage 的 sendResponse 载荷）。 */
export type LubanResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: SerializedError };

/** 构造 requestId（时间戳 + 随机，§3.7）。 */
export function makeRequestId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${Date.now()}-${rand}`;
}

/** 类型守卫：是否为错误响应。 */
export function isError<T>(r: LubanResponse<T>): r is { ok: false; error: SerializedError } {
  return r.ok === false;
}
