import { desc, eq } from "drizzle-orm";
import type { Database } from "./db.js";
import { eventsLog, streamSessions } from "./schema.js";

export interface RecentEventRow {
  id: string;
  type: string;
  username: string | null;
  payload: unknown;
  receivedAt: string;
}

export interface EventsRepository {
  createStreamSession(ownerId: string, tiktokUsername: string): Promise<string>;
  recordEvent(event: import("@tiktok-live/shared-types").LiveEvent, streamSessionId: string | null): Promise<void>;
  /** Chỉ trả event thuộc các stream_sessions của `ownerId` — cách ly theo tài khoản (multi-tenant). */
  getRecent(ownerId: string, limit: number): Promise<RecentEventRow[]>;
}

/**
 * Repository ghi LiveEvent vào events_log (docs/architecture/DATABASE-DESIGN.md).
 * "Ghi log đồng bộ có thể làm chậm pipeline chính nếu DB chậm — cần ghi bất đồng bộ
 * (fire-and-forget có log lỗi), không block event-bus" (MILESTONES.md — M03).
 * Vì vậy `recordEvent` KHÔNG throw ra ngoài — lỗi được trả về qua Promise reject để
 * caller (main.ts) tự quyết định log cảnh báo, không làm gián đoạn việc nhận event tiếp theo.
 */
export function createEventsRepository(db: Database): EventsRepository {
  return {
    async createStreamSession(ownerId: string, tiktokUsername: string): Promise<string> {
      const [row] = await db
        .insert(streamSessions)
        .values({ ownerId, tiktokUsername, status: "connecting", startedAt: new Date() })
        .returning({ id: streamSessions.id });
      return row.id;
    },

    async recordEvent(event, streamSessionId: string | null): Promise<void> {
      await db.insert(eventsLog).values({
        id: event.id,
        streamSessionId,
        type: event.type,
        payload: event.payload,
        userId: event.user.id,
        username: event.user.username,
        receivedAt: new Date(event.timestamp),
      });
    },

    async getRecent(ownerId: string, limit: number): Promise<RecentEventRow[]> {
      const rows = await db
        .select({
          id: eventsLog.id,
          type: eventsLog.type,
          username: eventsLog.username,
          payload: eventsLog.payload,
          receivedAt: eventsLog.receivedAt,
        })
        .from(eventsLog)
        .innerJoin(streamSessions, eq(eventsLog.streamSessionId, streamSessions.id))
        .where(eq(streamSessions.ownerId, ownerId))
        .orderBy(desc(eventsLog.receivedAt))
        .limit(limit);
      return rows.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() }));
    },
  };
}
