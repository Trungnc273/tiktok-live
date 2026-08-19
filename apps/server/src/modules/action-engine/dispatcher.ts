import type { RuleAction } from "@tiktok-live/shared-types";
import type { RuleMatch } from "../rule-engine/index.js";
import { HandlerRegistry } from "./handler-registry.js";
import { runWithRetry } from "./retry.js";
import { ActionTimeoutError, withTimeout } from "./timeout.js";
import type { ActionContext, ExecutionLogPort, ExecutionStatus } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;

export interface DispatchOutcome {
  actionIndex: number;
  actionType: string;
  status: ExecutionStatus;
  error?: string;
}

/**
 * Action Dispatcher (docs/architecture/RULE-ENGINE.md / MILESTONES.md — M04/M05):
 *
 * Rule Engine
 *      ↓
 * Action Dispatcher
 *      ↓
 * Action Handler (TTS/Sound/Overlay/WebSocket...)
 *
 * Yêu cầu bắt buộc:
 * - Actions chạy tuần tự, ĐÚNG thứ tự khai báo.
 * - 1 action lỗi KHÔNG được chặn action khác trong cùng rule (NFR-4).
 * - Hỗ trợ timeout + retry (retry chỉ áp dụng khi handler khai báo maxRetries > 0).
 * - Log mọi lần thực thi.
 * - Idempotent qua ExecutionLogPort.tryClaim() — action đã chạy cho cùng
 *   (eventId, automationId, actionIndex) sẽ KHÔNG chạy lại.
 */
export class ActionDispatcher {
  constructor(
    private readonly registry: HandlerRegistry,
    private readonly logPort: ExecutionLogPort,
  ) {}

  async dispatch(match: RuleMatch, ctx: ActionContext): Promise<DispatchOutcome[]> {
    const outcomes: DispatchOutcome[] = [];

    for (let actionIndex = 0; actionIndex < match.actions.length; actionIndex += 1) {
      const action = match.actions[actionIndex];
      const outcome = await this.runOne(match, action.type, actionIndex, action, ctx);
      outcomes.push(outcome);
      // Không break/return dù lỗi — tiếp tục action kế tiếp (NFR-4).
    }

    return outcomes;
  }

  private async runOne(
    match: RuleMatch,
    actionType: string,
    actionIndex: number,
    action: RuleAction,
    ctx: ActionContext,
  ): Promise<DispatchOutcome> {
    const logKey = { eventId: match.eventId, automationId: match.ruleId, actionIndex, actionType };

    const handler = this.registry.get(actionType);
    if (!handler) {
      // Không throw — action type chưa có handler (ví dụ chưa implement tới M06-M08)
      // được ghi nhận "skipped", không chặn action khác.
      await this.logPort.tryClaim(logKey, new Date());
      await this.logPort.updateResult(logKey, {
        status: "skipped",
        error: `Không có handler đăng ký cho action type "${actionType}"`,
        finishedAt: new Date(),
      });
      return { actionIndex, actionType, status: "skipped", error: `no handler for "${actionType}"` };
    }

    const startedAt = new Date();
    const claimed = await this.logPort.tryClaim(logKey, startedAt);
    if (!claimed) {
      // Đã thực thi trước đó cho đúng (eventId, ruleId, actionIndex) này -> idempotent skip.
      return { actionIndex, actionType, status: "skipped", error: "already executed (idempotent skip)" };
    }

    const timeoutMs = handler.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = handler.maxRetries ?? 0;

    try {
      await runWithRetry(() => withTimeout(handler.execute(action, ctx), timeoutMs), maxRetries);
      await this.logPort.updateResult(logKey, { status: "success", finishedAt: new Date() });
      return { actionIndex, actionType, status: "success" };
    } catch (err) {
      const status: ExecutionStatus = err instanceof ActionTimeoutError ? "timeout" : "failed";
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.logPort.updateResult(logKey, { status, error: errorMessage, finishedAt: new Date() });
      return { actionIndex, actionType, status, error: errorMessage };
    }
  }
}
