import { describe, expect, it } from "vitest";
import { createHttpServer } from "../http-server.js";
import { TokenStore } from "../../overlay-gateway/index.js";

const JWT_SECRET = "test-secret";

async function authCookieFor(app: Awaited<ReturnType<typeof createHttpServer>>): Promise<string> {
  const token = await app.jwt.sign({ id: "user-1", email: "a@test.com", role: "user" });
  return `token=${token}`;
}

describe("HTTP server", () => {
  it("GET /health trả 200 khi không cấu hình checkDb (test/dev không cần DB)", async () => {
    const app = await createHttpServer({ tokenStore: new TokenStore(), publicBaseUrl: "http://localhost:3000", jwtSecret: JWT_SECRET });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: null });
  });

  it("GET /health trả 200 + db:true khi checkDb thành công (PHASE 14 audit M1)", async () => {
    const app = await createHttpServer({
      tokenStore: new TokenStore(),
      publicBaseUrl: "http://localhost:3000",
      jwtSecret: JWT_SECRET,
      checkDb: async () => undefined,
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: true });
  });

  it("GET /health trả 503 + db:false khi checkDb thất bại (không giả vờ khoẻ mạnh)", async () => {
    const app = await createHttpServer({
      tokenStore: new TokenStore(),
      publicBaseUrl: "http://localhost:3000",
      jwtSecret: JWT_SECRET,
      checkDb: async () => {
        throw new Error("DB không khả dụng (giả lập)");
      },
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: false });
  });

  it("POST /api/overlays không đăng nhập -> 401 (bắt buộc auth, multi-tenant)", async () => {
    const app = await createHttpServer({ tokenStore: new TokenStore(), publicBaseUrl: "http://localhost:3000", jwtSecret: JWT_SECRET });
    const res = await app.inject({ method: "POST", url: "/api/overlays" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/overlays đã đăng nhập -> tạo token mới gắn đúng owner, URL đúng định dạng", async () => {
    const tokenStore = new TokenStore();
    const app = await createHttpServer({ tokenStore, publicBaseUrl: "http://localhost:3000", jwtSecret: JWT_SECRET });
    const cookie = await authCookieFor(app);
    const res = await app.inject({ method: "POST", url: "/api/overlays", headers: { cookie } });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(tokenStore.verify(body.token)).toBe("user-1");
    expect(body.url).toBe(`http://localhost:3000/overlay?token=${body.token}`);
  });

  it("mỗi lần gọi /api/overlays sinh token khác nhau", async () => {
    const tokenStore = new TokenStore();
    const app = await createHttpServer({ tokenStore, publicBaseUrl: "http://localhost:3000", jwtSecret: JWT_SECRET });
    const cookie = await authCookieFor(app);
    const res1 = await app.inject({ method: "POST", url: "/api/overlays", headers: { cookie } });
    const res2 = await app.inject({ method: "POST", url: "/api/overlays", headers: { cookie } });
    expect(res1.json().token).not.toBe(res2.json().token);
  });

  it("lỗi không được bắt tường minh -> trả message chung, không lộ chi tiết nội bộ (PHASE 14 audit M2)", async () => {
    const app = await createHttpServer({
      tokenStore: new TokenStore(),
      publicBaseUrl: "http://localhost:3000",
      jwtSecret: JWT_SECRET,
      automationsRepository: {
        list: async () => {
          throw new Error("connection string chứa mật khẩu bí mật XYZ");
        },
        get: async () => null,
        create: async (_owner, i) => ({ ...i, id: "x", createdAt: "", updatedAt: "" }),
        update: async () => null,
        delete: async () => false,
        duplicate: async () => null,
      },
    });
    const cookie = await authCookieFor(app);

    const res = await app.inject({ method: "GET", url: "/api/automations", headers: { cookie } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("XYZ");
    expect(res.json()).toEqual({ error: "Lỗi máy chủ nội bộ" });
  });
});
