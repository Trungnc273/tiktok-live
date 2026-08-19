import { EventEmitter } from "node:events";
import type {
  AdapterEvent,
  ConnectionManagerOptions,
  ConnectionState,
  LiveProvider,
} from "./types.js";

const DEFAULT_OPTIONS: Required<ConnectionManagerOptions> = {
  maxReconnectAttempts: 10,
  baseReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30_000,
};

/**
 * Quản lý vòng đời kết nối tới TikTok LIVE qua 1 LiveProvider (thật hoặc mock).
 * Xử lý reconnect với exponential backoff + jitter (docs/architecture/SYSTEM-ARCHITECTURE.md
 * — Error handling & Retry strategy).
 *
 * Đây là module DUY NHẤT được phép biết chi tiết provider. Consumer bên ngoài chỉ
 * lắng nghe "event" (AdapterEvent) và "stateChange" (ConnectionState) qua EventEmitter.
 */
export class ConnectionManager extends EventEmitter {
  private readonly provider: LiveProvider;
  private readonly options: Required<ConnectionManagerOptions>;
  private username: string | null = null;
  private state: ConnectionState = "idle";
  private reconnectAttempts = 0;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(provider: LiveProvider, options: ConnectionManagerOptions = {}) {
    super();
    this.provider = provider;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.provider.onEvent((event: AdapterEvent) => {
      this.emit("event", event);
    });

    this.provider.onDisconnect((reason: unknown) => {
      this.handleUnexpectedDisconnect(reason);
    });
  }

  getState(): ConnectionState {
    return this.state;
  }

  async connect(username: string): Promise<void> {
    this.stopped = false;
    this.username = username;
    this.reconnectAttempts = 0;
    await this.attemptConnect();
  }

  /** Graceful shutdown — ngừng mọi ý định reconnect và ngắt kết nối. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.provider.disconnect();
    } finally {
      this.setState("disconnected");
    }
  }

  private async attemptConnect(): Promise<void> {
    if (!this.username) return;
    this.setState(this.reconnectAttempts === 0 ? "connecting" : "reconnecting");
    try {
      await this.provider.connect(this.username);
      this.reconnectAttempts = 0;
      this.setState("connected");
    } catch (err) {
      this.emit("connectionError", err);
      this.scheduleReconnect();
    }
  }

  private handleUnexpectedDisconnect(reason: unknown): void {
    if (this.stopped) return;
    this.emit("connectionError", reason instanceof Error ? reason : new Error(String(reason)));
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setState("error");
      this.emit(
        "connectionError",
        new Error(
          `Đã thử reconnect ${this.options.maxReconnectAttempts} lần liên tiếp không thành công. Dừng tự động retry.`,
        ),
      );
      return;
    }

    const delay = this.computeBackoffDelay(this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.setState("reconnecting");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptConnect();
    }, delay);
  }

  private computeBackoffDelay(attempt: number): number {
    const exponential = this.options.baseReconnectDelayMs * 2 ** attempt;
    const capped = Math.min(exponential, this.options.maxReconnectDelayMs);
    const jitter = Math.random() * 0.3 * capped; // +0-30% jitter, tránh thundering herd
    return Math.round(capped + jitter);
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit("stateChange", next);
  }
}
