import type { LiveEvent, RuleAction } from "@tiktok-live/shared-types";

export interface ActionContext {
  event: LiveEvent;
  ruleId: string;
  ruleName: string;
}

export type ExecutionStatus = "success" | "failed" | "timeout" | "skipped";

export interface ActionHandler {
  /** Phải khớp `RuleAction.type` (ví dụ "tts", "sound", "overlay", "websocket"). */
  type: string;
  /** Timeout riêng cho handler này, ms. Mặc định dùng DEFAULT_TIMEOUT_MS nếu bỏ trống. */
  timeoutMs?: number;
  /** Số lần retry khi thất bại (0 = không retry). Chỉ bật cho action idempotent an toàn để lặp lại. */
  maxRetries?: number;
  execute(action: RuleAction, ctx: ActionContext): Promise<void>;
}

export interface ExecutionLogEntry {
  eventId: string;
  automationId: string;
  actionIndex: number;
  actionType: string;
}

/**
 * Port (interface) cho việc ghi execution log — Action Engine KHÔNG phụ thuộc
 * trực tiếp Postgres/Drizzle (docs/architecture/SYSTEM-ARCHITECTURE.md: module
 * boundary rõ ràng). Implementation thật nằm ở persistence module (M03).
 *
 * Cơ chế idempotency: tryClaim() insert 1 row "pending" cho khoá
 * (eventId, automationId, actionIndex) — nếu khoá đã tồn tại (đã chạy trước đó),
 * trả về false và Action Engine SẼ KHÔNG thực thi action đó lần nữa.
 */
export interface ExecutionLogPort {
  tryClaim(entry: ExecutionLogEntry, startedAt: Date): Promise<boolean>;
  updateResult(
    entry: ExecutionLogEntry,
    result: { status: ExecutionStatus; error?: string; finishedAt: Date },
  ): Promise<void>;
}
