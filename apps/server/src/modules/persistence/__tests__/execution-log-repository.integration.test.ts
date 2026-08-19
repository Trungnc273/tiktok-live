import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "../db.js";
import { createExecutionLogPort } from "../execution-log-repository.js";
import { automations, eventsLog, executionLogs } from "../schema.js";

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

async function seedEventAndAutomation() {
  const eventId = randomUUID();
  const automationId = randomUUID();
  await db.insert(eventsLog).values({
    id: eventId,
    type: "gift",
    payload: {},
    userId: "u1",
    username: "tester",
  });
  await db.insert(automations).values({
    id: automationId,
    name: "test automation",
    triggerEventType: "gift",
    actions: [{ type: "tts", payload: {} }],
  });
  return { eventId, automationId };
}

describe("ExecutionLogPort (Postgres thật)", () => {
  it("tryClaim thành công lần đầu, thất bại (idempotent) lần 2 cho cùng khoá", async () => {
    const { eventId, automationId } = await seedEventAndAutomation();
    const port = createExecutionLogPort(db);
    const entry = { eventId, automationId, actionIndex: 0, actionType: "tts" };

    const firstClaim = await port.tryClaim(entry, new Date());
    const secondClaim = await port.tryClaim(entry, new Date());

    expect(firstClaim).toBe(true);
    expect(secondClaim).toBe(false); // vi phạm unique index -> đã claim trước đó

    await port.updateResult(entry, { status: "success", finishedAt: new Date() });
    const [row] = await db.select().from(executionLogs).where(eq(executionLogs.eventId, eventId));
    expect(row.status).toBe("success");

    await db.delete(executionLogs).where(eq(executionLogs.eventId, eventId));
    await db.delete(eventsLog).where(eq(eventsLog.id, eventId));
    await db.delete(automations).where(eq(automations.id, automationId));
  });
});
