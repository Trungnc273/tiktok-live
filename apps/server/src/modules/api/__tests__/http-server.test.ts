import { describe, expect, it } from "vitest";
import { createHttpServer } from "../http-server.js";
import { TokenStore } from "../../overlay-gateway/index.js";

describe("HTTP server", () => {
  it("GET /health trả 200 khi không cấu hình checkDb (test/dev không cần DB)", async () => {
    const app = createHttpServer({ tokenStore: new TokenStore(), publicBaseUrl: "http://localhost:3000" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: null });
  });

  it("GET /health trả 200 + db:true khi checkDb thành công (PHASE 14 audit M1)", async () => {
    const app = createHttpServer({
      tokenStore: new TokenStore(),
      publicBaseUrl: "http://localhost:3000",
      checkDb: async () => undefined,
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: true });
  });

  it("GET /health trả 503 + db:false khi checkDb thất bại (không giả vờ khoẻ mạnh)", async () => {
    const app = createHttpServer({
      tokenStore: new TokenStore(),
      publicBaseUrl: "http://localhost:3000",
      checkDb: async () => {
        throw new Error("DB không khả dụng (giả lập)");
      },
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: false });
  });

  it("POST /api/overlays tạo token mới và URL đúng định dạng", async () => {
    const tokenStore = new TokenStore();
    const app = createHttpServer({ tokenStore, publicBaseUrl: "http://localhost:3000" });
    const res = await app.inject({ method: "POST", url: "/api/overlays" });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(tokenStore.verify(body.token)).toBe(true);
    expect(body.url).toBe(`http://localhost:3000/overlay?token=${body.token}`);
  });

  it("mỗi lần gọi /api/overlays sinh token khác nhau", async () => {
    const tokenStore = new TokenStore();
    const app = createHttpServer({ tokenStore, publicBaseUrl: "http://localhost:3000" });
    const res1 = await app.inject({ method: "POST", url: "/api/overlays" });
    const res2 = await app.inject({ method: "POST", url: "/api/overlays" });
    expect(res1.json().token).not.toBe(res2.json().token);
  });

  it("lỗi không được bắt tường minh -> trả message chung, không lộ chi tiết nội bộ (PHASE 14 audit M2)", async () => {
    const app = createHttpServer({
      tokenStore: new TokenStore(),
      publicBaseUrl: "http://localhost:3000",
      automationsRepository: {
        list: async () => {
          throw new Error("connection string chứa mật khẩu bí mật XYZ");
        },
        get: async () => null,
        create: async (i) => ({ ...i, id: "x", createdAt: "", updatedAt: "" }),
        update: async () => null,
        delete: async () => false,
        duplicate: async () => null,
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/automations" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("XYZ");
    expect(res.json()).toEqual({ error: "Lỗi máy chủ nội bộ" });
  });
});
