import Fastify, { type FastifyInstance } from "fastify";
import type { TokenStore } from "../overlay-gateway/index.js";

export interface HttpServerDeps {
  tokenStore: TokenStore;
  publicBaseUrl: string; // ví dụ http://localhost:3000 — dùng để dựng overlay URL đầy đủ
}

/**
 * REST API tối thiểu cho M08: tạo overlay URL + token. CRUD automation đầy đủ
 * thuộc M10 (Dashboard) — chưa làm ở đây.
 */
export function createHttpServer(deps: HttpServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/api/overlays", async () => {
    const token = deps.tokenStore.issue();
    const url = `${deps.publicBaseUrl}/overlay?token=${token}`;
    return { token, url };
  });

  return app;
}
