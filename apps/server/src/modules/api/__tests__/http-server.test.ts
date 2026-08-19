import { describe, expect, it } from "vitest";
import { createHttpServer } from "../http-server.js";
import { TokenStore } from "../../overlay-gateway/index.js";

describe("HTTP server", () => {
  it("GET /health trả về status ok", async () => {
    const app = createHttpServer({ tokenStore: new TokenStore(), publicBaseUrl: "http://localhost:3000" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
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
});
