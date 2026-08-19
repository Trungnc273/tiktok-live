/**
 * Core system KHÔNG được phụ thuộc trực tiếp vào library-specific event object
 * (yêu cầu M01 / docs/architecture/SYSTEM-ARCHITECTURE.md).
 *
 * AdapterEvent là envelope trung lập: tên sự kiện dạng string + payload unknown.
 * event-normalizer (M02) mới là nơi diễn giải payload này thành LiveEvent chuẩn hoá.
 */
export interface AdapterEvent {
  name: string;
  data: unknown;
  receivedAt: string; // ISO 8601, giờ adapter nhận được (không tin timestamp thô từ thư viện)
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

/**
 * Interface mà bất kỳ provider nào (thư viện thật hoặc mock) phải implement.
 * Cho phép thay thư viện unofficial khác trong tương lai mà không đổi ConnectionManager.
 */
export interface LiveProvider {
  connect(username: string): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(handler: (event: AdapterEvent) => void): void;
  onDisconnect(handler: (reason: unknown) => void): void;
}

export interface ConnectionManagerOptions {
  /** Số lần thử reconnect liên tiếp tối đa trước khi chuyển hẳn sang "error" và ngừng tự retry. */
  maxReconnectAttempts?: number;
  /** Độ trễ cơ sở (ms) cho exponential backoff. */
  baseReconnectDelayMs?: number;
  /** Trần độ trễ (ms). */
  maxReconnectDelayMs?: number;
}
