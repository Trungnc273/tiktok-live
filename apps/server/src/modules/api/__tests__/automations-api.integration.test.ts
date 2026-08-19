import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createHttpServer } from "../http-server.js";
import { createDb, createAutomationsRepository, type Database } from "../../persistence/index.js";
import { automations } from "../../persistence/schema.js";
import { TokenStore } from "../../overlay-gateway/index.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";

let db: Database;
let app: ReturnType<typeof createHttpServer>;
const createdIds: string[] = [];

beforeAll(() => {
  db = createDb(connectionString);
  app = createHttpServer({
    tokenStore: new TokenStore(),
    publicBaseUrl: "http://localhost:3000",
    automationsRepository: createAutomationsRepository(db),
  });
});

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(automations).where(eq(automations.id, id));
  }
  await db.$client.end();
});

function validAutomationBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Gift Rose -> TTS",
    enabled: true,
    priority: 100,
    trigger: { eventType: "gift" },
    conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
    actions: [{ type: "tts", payload: { template: "Cảm ơn {username} đã tặng Rose!" } }],
    ...overrides,
  };
}

describe("Automations REST API (Postgres thật)", () => {
  it("POST /api/automations tạo rule hợp lệ thành công (201)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/automations", payload: validAutomationBody() });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    createdIds.push(body.id);
    expect(body.name).toBe("Gift Rose -> TTS");
    expect(body.trigger).toEqual({ eventType: "gift" });
  });

  it("POST /api/automations reject rule với field ngoài whitelist (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/automations",
      payload: validAutomationBody({
        trigger: { eventType: "follow" },
        conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("không hợp lệ");
  });

  it("POST /api/automations reject payload thiếu field bắt buộc (400)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/automations", payload: { name: "thiếu mọi thứ" } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/automations trả về danh sách gồm rule vừa tạo", async () => {
    const createRes = await app.inject({ method: "POST", url: "/api/automations", payload: validAutomationBody() });
    const created = createRes.json();
    createdIds.push(created.id);

    const listRes = await app.inject({ method: "GET", url: "/api/automations" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().some((r: { id: string }) => r.id === created.id)).toBe(true);
  });

  it("PUT /api/automations/:id cập nhật enabled -> false", async () => {
    const createRes = await app.inject({ method: "POST", url: "/api/automations", payload: validAutomationBody() });
    const created = createRes.json();
    createdIds.push(created.id);

    const updateRes = await app.inject({
      method: "PUT",
      url: `/api/automations/${created.id}`,
      payload: { enabled: false },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().enabled).toBe(false);
  });

  it("PUT /api/automations/:id với id không tồn tại -> 404", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/automations/00000000-0000-0000-0000-000000000000",
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/automations/:id/duplicate tạo bản sao độc lập", async () => {
    const createRes = await app.inject({ method: "POST", url: "/api/automations", payload: validAutomationBody() });
    const created = createRes.json();
    createdIds.push(created.id);

    const dupRes = await app.inject({ method: "POST", url: `/api/automations/${created.id}/duplicate` });
    expect(dupRes.statusCode).toBe(201);
    const duplicated = dupRes.json();
    createdIds.push(duplicated.id);
    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.name).toContain("copy");
  });

  it("DELETE /api/automations/:id xoá thành công (204), GET sau đó không còn thấy", async () => {
    const createRes = await app.inject({ method: "POST", url: "/api/automations", payload: validAutomationBody() });
    const created = createRes.json();

    const deleteRes = await app.inject({ method: "DELETE", url: `/api/automations/${created.id}` });
    expect(deleteRes.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: "/api/automations" });
    expect(listRes.json().some((r: { id: string }) => r.id === created.id)).toBe(false);
  });
});
