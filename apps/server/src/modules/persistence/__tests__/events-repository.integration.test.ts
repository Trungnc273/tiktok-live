import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { createDb, type Database } from "../db.js";
import { createEventsRepository } from "../events-repository.js";
import { eventsLog, streamSessions } from "../schema.js";
import { eq } from "drizzle-orm";

/**
 * Integration test THẬT — kết nối tới Postgres thật chạy qua docker-compose.yml
 * (xem docs/reports/M03-REPORT.md). Không dùng mock ở đây, đúng yêu cầu M03
 * "test khi DB không khả dụng" cần hạ tầng thật để có ý nghĩa.
 */
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";

let db: Database;

beforeAll(() => {
  db = createDb(connectionString);
});

afterAll(async () => {
  await db.$client.end();
});

function fixtureEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    streamId: "test-stream",
    type: "follow",
    user: { id: "u1", username: "tester" },
    payload: {},
    ...overrides,
  } as LiveEvent;
}

describe("EventsRepository (Postgres thật)", () => {
  it("tạo stream session và ghi/đọc lại LiveEvent đúng dữ liệu", async () => {
    const repo = createEventsRepository(db);
    const sessionId = await repo.createStreamSession("test_streamer");
    expect(sessionId).toBeTruthy();

    const event = fixtureEvent();
    await repo.recordEvent(event, sessionId);

    const [row] = await db.select().from(eventsLog).where(eq(eventsLog.id, event.id));

    expect(row).toBeDefined();
    expect(row.type).toBe("follow");
    expect(row.username).toBe("tester");
    expect(row.streamSessionId).toBe(sessionId);

    // dọn dẹp
    await db.delete(eventsLog).where(eq(eventsLog.id, event.id));
    await db.delete(streamSessions).where(eq(streamSessions.id, sessionId));
  });

  it("ghi event mà không có stream session (streamSessionId = null) vẫn thành công", async () => {
    const repo = createEventsRepository(db);
    const event = fixtureEvent({ type: "like", payload: { count: 3 } });
    await repo.recordEvent(event, null);

    const [row] = await db.select().from(eventsLog).where(eq(eventsLog.id, event.id));
    expect(row.streamSessionId).toBeNull();

    await db.delete(eventsLog).where(eq(eventsLog.id, event.id));
  });

  it("báo lỗi rõ ràng (reject Promise) khi ghi event trùng id thay vì âm thầm mất dữ liệu", async () => {
    const repo = createEventsRepository(db);
    const event = fixtureEvent();
    await repo.recordEvent(event, null);

    await expect(repo.recordEvent(event, null)).rejects.toThrow();

    await db.delete(eventsLog).where(eq(eventsLog.id, event.id));
  });
});
