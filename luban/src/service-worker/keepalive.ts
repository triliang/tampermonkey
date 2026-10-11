// 保活（§3.3 / §七）：MV3 Service Worker 空闲一段时间会被回收，流式生成期间需要一个
// 周期性活动让 SW 保持「正忙」。做法：Port 建立期间按固定间隔投一条 KEEPALIVE 消息，
// 流结束（或 Port 断开）立即停止——绝不在空闲时继续占用。

const KEEPALIVE_INTERVAL_MS = 20_000;

export class StreamKeepAlive {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly port: chrome.runtime.Port) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.port.postMessage({ type: 'KEEPALIVE' });
      } catch {
        this.stop(); // Port 已断开（Side Panel 关闭），停止自己，不留定时器
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
