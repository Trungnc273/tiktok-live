import type { ExecutionLogEntry, ExecutionLogPort, ExecutionStatus } from "./types.js";

interface Record_ {
  status: ExecutionStatus | "pending";
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
}

function keyOf(entry: ExecutionLogEntry): string {
  return `${entry.eventId}::${entry.automationId}::${entry.actionIndex}`;
}

/**
 * ExecutionLogPort in-memory — dùng cho unit test và cho dev khi chưa cần bền
 * vững qua restart. Implementation thật (Postgres) nằm ở persistence module.
 */
export class MemoryExecutionLogPort implements ExecutionLogPort {
  private readonly records = new Map<string, Record_>();

  async tryClaim(entry: ExecutionLogEntry, startedAt: Date): Promise<boolean> {
    const key = keyOf(entry);
    if (this.records.has(key)) return false;
    this.records.set(key, { status: "pending", startedAt });
    return true;
  }

  async updateResult(
    entry: ExecutionLogEntry,
    result: { status: ExecutionStatus; error?: string; finishedAt: Date },
  ): Promise<void> {
    const key = keyOf(entry);
    const existing = this.records.get(key);
    this.records.set(key, { ...existing, ...result, startedAt: existing?.startedAt ?? result.finishedAt });
  }

  getRecord(entry: ExecutionLogEntry): Record_ | undefined {
    return this.records.get(keyOf(entry));
  }
}
