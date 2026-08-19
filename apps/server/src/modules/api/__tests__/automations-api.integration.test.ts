import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createHttpServer } from "../http-server.js";
import { createDb, createAutomationsRepository, type Database } from "../../persistence/index.js";
import { automations, users } from "../../persistence/schema.js";
import { TokenStore } from "../../overlay-gateway/index.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";
const JWT_SECRET = "test-secret";

let db: Database;
let app: Awaited<ReturnType<typeof createHttpServer>>;
let ownerId: string;
let authHeaders: { cookie: string };
const createdIds: string[] = [];

beforeAll(async () => {
  db = createDb(connectionString);
  app = await createHttpServer({
    tokenStore: new TokenStore(),
    publicBaseUrl: "http://localhost:3000",
    jwtSecret: JWT_SECRET,
    automationsRepository: createAutomationsRepository(db),
  });

  const [owner] = await db
    .insert(users)
    .values({ email: `test-automations-${randomUUID()}@example.com`, passwordHash: "x", role: "user" })
    .returning({ id: users.id });
  ownerId = owner.id;
  const token = await app.jwt.sign({ id: ownerId, email: "x@test.com", role: "user" });
  authHeaders = { cookie: `token=${token}` };
});

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(automations).where(eq(automations.id, id));
  }
  await db.delete(users).where(eq(users.id, ownerId));
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
  it("không đăng nhập -> 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/automations" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/automations tạo rule hợp lệ thành công (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: validAutomationBody(),
    });
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
      headers: authHeaders,
      payload: validAutomationBody({
        trigger: { eventType: "follow" },
        conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("không hợp lệ");
  });

  it("POST /api/automations reject payload thiếu field bắt buộc (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: { name: "thiếu mọi thứ" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/automations trả về danh sách gồm rule vừa tạo", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: validAutomationBody(),
    });
    const created = createRes.json();
    createdIds.push(created.id);

    const listRes = await app.inject({ method: "GET", url: "/api/automations", headers: authHeaders });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().some((r: { id: string }) => r.id === created.id)).toBe(true);
  });

  it("PUT /api/automations/:id cập nhật enabled -> false", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: validAutomationBody(),
    });
    const created = createRes.json();
    createdIds.push(created.id);

    const updateRes = await app.inject({
      method: "PUT",
      url: `/api/automations/${created.id}`,
      headers: authHeaders,
      payload: { enabled: false },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().enabled).toBe(false);
  });

  it("PUT /api/automations/:id với id không tồn tại -> 404", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/automations/00000000-0000-0000-0000-000000000000",
      headers: authHeaders,
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/automations/:id/duplicate tạo bản sao độc lập", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: validAutomationBody(),
    });
    const created = createRes.json();
    createdIds.push(created.id);

    const dupRes = await app.inject({
      method: "POST",
      url: `/api/automations/${created.id}/duplicate`,
      headers: authHeaders,
    });
    expect(dupRes.statusCode).toBe(201);
    const duplicated = dupRes.json();
    createdIds.push(duplicated.id);
    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.name).toContain("copy");
  });

  it("DELETE /api/automations/:id xoá thành công (204), GET sau đó không còn thấy", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: validAutomationBody(),
    });
    const created = createRes.json();

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/automations/${created.id}`,
      headers: authHeaders,
    });
    expect(deleteRes.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: "/api/automations", headers: authHeaders });
    expect(listRes.json().some((r: { id: string }) => r.id === created.id)).toBe(false);
  });

  it("CÁCH LY MULTI-TENANT: owner khác không thấy/xoá được automation của owner này", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: authHeaders,
      payload: validAutomationBody(),
    });
    const created = createRes.json();
    createdIds.push(created.id);

    const otherToken = await app.jwt.sign({ id: randomUUID(), email: "other@test.com", role: "user" });
    const otherHeaders = { cookie: `token=${otherToken}` };

    const listRes = await app.inject({ method: "GET", url: "/api/automations", headers: otherHeaders });
    expect(listRes.json().some((r: { id: string }) => r.id === created.id)).toBe(false);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/automations/${created.id}`,
      headers: otherHeaders,
    });
    expect(deleteRes.statusCode).toBe(404); // "không tìm thấy", không phải "403 của người khác" — tránh lộ tồn tại
  });
});
