import type { AdapterEvent, LiveProvider } from "../types.js";

/**
 * Provider giả lập — dùng cho unit test và cho phát triển khi không có phòng LIVE
 * thật để kết nối liên tục (docs/implementation/MILESTONES.md — M01 Acceptance criteria).
 *
 * KHÔNG được dùng làm bằng chứng "M01 hoạt động với TikTok thật" — chỉ chứng minh
 * ConnectionManager (state machine, reconnect) hoạt động đúng logic.
 */
export class MockProvider implements LiveProvider {
  private eventHandler: ((event: AdapterEvent) => void) | null = null;
  private disconnectHandler: ((reason: unknown) => void) | null = null;
  private connected = false;

  /** Điều khiển hành vi test: nếu true, connect() tiếp theo sẽ reject. */
  public failNextConnect = false;

  async connect(username: string): Promise<void> {
    if (this.failNextConnect) {
      this.failNextConnect = false;
      throw new Error(`MockProvider: giả lập lỗi kết nối tới @${username}`);
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  onEvent(handler: (event: AdapterEvent) => void): void {
    this.eventHandler = handler;
  }

  onDisconnect(handler: (reason: unknown) => void): void {
    this.disconnectHandler = handler;
  }

  /** Test helper: bơm 1 event giả lập vào như thể thư viện thật gửi tới. */
  emitFakeEvent(name: string, data: unknown): void {
    if (!this.connected) {
      throw new Error("MockProvider: chưa connected, không thể emit event");
    }
    this.eventHandler?.({ name, data, receivedAt: new Date().toISOString() });
  }

  /** Test helper: giả lập mất kết nối đột ngột (không phải do gọi disconnect()). */
  simulateUnexpectedDisconnect(reason: unknown = "connection lost"): void {
    this.connected = false;
    this.disconnectHandler?.(reason);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
