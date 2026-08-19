import { and, eq } from "drizzle-orm";
import type { ExecutionLogEntry, ExecutionLogPort, ExecutionStatus } from "../action-engine/types.js";
import type { Database } from "./db.js";
import { executionLogs } from "./schema.js";

/**
 * Implementation Postgres của ExecutionLogPort (interface định nghĩa ở action-engine
 * — module boundary: action-engine không import Drizzle/Postgres trực tiếp).
 *
 * Idempotency dựa vào unique index (event_id, automation_id, action_index) đã tạo
 * ở M03 (schema.ts) — tryClaim() bắt lỗi vi phạm unique constraint thay vì
 * SELECT-rồi-INSERT (tránh race condition giữa check và insert).
 */
export function createExecutionLogPort(db: Database): ExecutionLogPort {
  return {
    async tryClaim(entry: ExecutionLogEntry, startedAt: Date): Promise<boolean> {
      try {
        await db.insert(executionLogs).values({
          eventId: entry.eventId,
          automationId: entry.automationId,
          actionIndex: entry.actionIndex,
          actionType: entry.actionType,
          status: "skipped", // placeholder tạm, được updateResult() ghi đè ngay sau khi thực thi xong
          startedAt,
        });
        return true;
      } catch {
        // Vi phạm unique constraint (event_id, automation_id, action_index) -> đã claim trước đó.
        return false;
      }
    },

    async updateResult(
      entry: ExecutionLogEntry,
      result: { status: ExecutionStatus; error?: string; finishedAt: Date },
    ): Promise<void> {
      await db
        .update(executionLogs)
        .set({ status: result.status, error: result.error ?? null, finishedAt: result.finishedAt })
        .where(
          and(
            eq(executionLogs.eventId, entry.eventId),
            eq(executionLogs.automationId, entry.automationId),
            eq(executionLogs.actionIndex, entry.actionIndex),
          ),
        );
    },
  };
}
