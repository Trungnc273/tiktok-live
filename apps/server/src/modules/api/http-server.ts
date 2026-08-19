import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { TokenStore } from "../overlay-gateway/index.js";

export interface HttpServerDeps {
  tokenStore: TokenStore;
  publicBaseUrl: string; // ví dụ http://localhost:3000 — dùng để dựng overlay URL đầy đủ
  /** Thư mục chứa audio TTS sinh ra (M06), phục vụ tĩnh tại /media/:file. Optional — bỏ qua nếu chưa cấu hình. */
  mediaDir?: string;
  /** Thư mục chứa file sound cấu hình sẵn (M07), phục vụ tĩnh tại /sounds/:file. Optional. */
  soundsDir?: string;
}

/**
 * REST API + static file server tối thiểu:
 * - M08: tạo overlay URL + token.
 * - M09: phục vụ file audio (TTS output + sound cấu hình) qua HTTP để overlay
 *   browser tải về phát (docs/promp/PHASE_9.md/PHASE_10.md — action sound/tts phải
 *   phát được ở overlay, không phải ở server).
 *
 * CRUD automation đầy đủ thuộc M10 (Dashboard) — chưa làm ở đây.
 */
export function createHttpServer(deps: HttpServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/api/overlays", async () => {
    const token = deps.tokenStore.issue();
    const url = `${deps.publicBaseUrl}/overlay?token=${token}`;
    return { token, url };
  });

  if (deps.mediaDir) {
    void app.register(fastifyStatic, { root: deps.mediaDir, prefix: "/media/", decorateReply: false });
  }
  if (deps.soundsDir) {
    void app.register(fastifyStatic, {
      root: deps.soundsDir,
      prefix: "/sounds/",
      decorateReply: false,
    });
  }

  return app;
}
