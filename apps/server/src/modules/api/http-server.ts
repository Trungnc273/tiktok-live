import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { automationRuleSchema } from "@tiktok-live/shared-types";
import type { TokenStore } from "../overlay-gateway/index.js";
import type { AutomationsRepository, EventsRepository, UsersRepository } from "../persistence/index.js";
import type { StatusTracker } from "./status-tracker.js";
import { validateRule } from "../rule-engine/index.js";
import { logger } from "../../config/logger.js";
import { registerAuthPlugin, registerAuthRoutes, registerAdminRoutes } from "../auth/index.js";
import type { LiveSessionManager } from "../live-session/index.js";

export interface HttpServerDeps {
  tokenStore: TokenStore;
  publicBaseUrl: string;
  mediaDir?: string;
  soundsDir?: string;
  automationsRepository?: AutomationsRepository;
  eventsRepository?: EventsRepository;
  /** Bắt buộc để bật route đăng nhập/đăng ký/admin — optional để test cũ không cần auth vẫn chạy được (test đó sẽ không gọi các route yêu cầu auth). */
  usersRepository?: UsersRepository;
  /** Trạng thái kết nối TikTok theo từng owner (multi-tenant) — key = ownerId. */
  statusTrackers?: Map<string, StatusTracker>;
  /**
   * Box (tham chiếu gián tiếp) thay vì truyền thẳng `LiveSessionManager` — tránh
   * vòng phụ thuộc khởi tạo: LiveSessionManager cần OverlayGateway, OverlayGateway
   * cần http.Server thật (chỉ có sau khi createHttpServer() chạy xong). main.ts gán
   * `liveSessionManagerBox.current` SAU khi cả 2 đã sẵn sàng.
   */
  liveSessionManagerBox?: { current: LiveSessionManager | null };
  /** Ping DB thật cho /health (PHASE 14 audit M1). */
  checkDb?: () => Promise<void>;
  /** Nguồn cho phép CORS (PHASE 14 audit L2) — mặc định "*" cho dev, PHẢI thắt chặt khi deploy production thật. */
  corsOrigin?: string | string[] | boolean;
  jwtSecret: string;
  secureCookie?: boolean;
}

const createAutomationBodySchema = automationRuleSchema.omit({ id: true, createdAt: true, updatedAt: true });
const updateAutomationBodySchema = createAutomationBodySchema.partial();

export async function createHttpServer(deps: HttpServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: deps.corsOrigin ?? "*" });
  await registerAuthPlugin(app, { jwtSecret: deps.jwtSecret, secureCookie: deps.secureCookie ?? false });

  // Không để lộ chi tiết lỗi nội bộ (message/stack Postgres...) ra response JSON
  // cho client (PHASE 14 audit M2) — log đầy đủ ở server, trả message chung ra ngoài.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    logger.error({ err, url: req.url, method: req.method }, "Lỗi xử lý request không được bắt tường minh");
    const statusCode = err.statusCode ?? 500;
    reply.code(statusCode).send({ error: statusCode >= 500 ? "Lỗi máy chủ nội bộ" : err.message });
  });

  app.get("/health", async (_req, reply) => {
    const dbOk = deps.checkDb
      ? await deps.checkDb().then(
          () => true,
          () => false,
        )
      : null; // null = không cấu hình kiểm tra DB (test/dev không truyền checkDb)

    const healthy = dbOk !== false;
    reply.code(healthy ? 200 : 503);
    return { status: healthy ? "ok" : "degraded", db: dbOk };
  });

  if (deps.usersRepository) {
    registerAuthRoutes(app, { usersRepository: deps.usersRepository, secureCookie: deps.secureCookie ?? false });
    registerAdminRoutes(app, { usersRepository: deps.usersRepository });
  }

  app.post("/api/overlays", { preHandler: app.authenticate }, async (req) => {
    const token = deps.tokenStore.issue(req.user.id);
    const url = `${deps.publicBaseUrl}/overlay?token=${token}`;
    return { token, url };
  });

  if (deps.mediaDir) {
    void app.register(fastifyStatic, { root: deps.mediaDir, prefix: "/media/", decorateReply: false });
  }
  if (deps.soundsDir) {
    void app.register(fastifyStatic, { root: deps.soundsDir, prefix: "/sounds/", decorateReply: false });
  }

  // --- Live monitoring start/stop (multi-tenant) — mỗi user tự bật/tắt theo dõi TikTok của mình ---

  app.post("/api/live/start", { preHandler: app.authenticate }, async (req, reply) => {
    const user = await deps.usersRepository?.findById(req.user.id);
    if (!user?.tiktokUsername) {
      reply.code(400);
      return { error: "Chưa cấu hình tiktokUsername — đặt qua PUT /api/auth/tiktok-username trước" };
    }
    if (!deps.liveSessionManagerBox?.current) {
      reply.code(503);
      return { error: "Live session manager chưa sẵn sàng" };
    }
    if (deps.liveSessionManagerBox?.current.isActive(req.user.id)) {
      reply.code(409);
      return { error: "Đã đang theo dõi live rồi" };
    }
    try {
      await deps.liveSessionManagerBox?.current.start(req.user.id, user.tiktokUsername);
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Không khởi động được phiên theo dõi" };
    }
    return { ok: true };
  });

  app.post("/api/live/stop", { preHandler: app.authenticate }, async (req) => {
    await deps.liveSessionManagerBox?.current?.stop(req.user.id);
    return { ok: true };
  });

  // --- Dashboard: status & recent events (M10), scope theo owner đăng nhập (multi-tenant) ---

  app.get("/api/status", { preHandler: app.authenticate }, async (req) => {
    const tracker = deps.statusTrackers?.get(req.user.id);
    return tracker?.snapshot() ?? { connectionState: "idle", viewerCount: null, counts: {} };
  });

  app.get("/api/events/recent", { preHandler: app.authenticate }, async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 20);
    return deps.eventsRepository?.getRecent(req.user.id, Math.min(limit, 100)) ?? [];
  });

  // --- Automations CRUD (M10), scope theo owner đăng nhập (multi-tenant) ---

  app.get("/api/automations", { preHandler: app.authenticate }, async (req) => {
    return (await deps.automationsRepository?.list(req.user.id)) ?? [];
  });

  app.post("/api/automations", { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = createAutomationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Dữ liệu automation không hợp lệ", details: parsed.error.issues };
    }

    const validation = validateRule({
      ...parsed.data,
      id: "temp",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!validation.valid) {
      reply.code(400);
      return { error: "Rule không hợp lệ", details: validation.errors };
    }

    const created = await deps.automationsRepository?.create(req.user.id, parsed.data);
    reply.code(201);
    return created;
  });

  app.put("/api/automations/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateAutomationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Dữ liệu automation không hợp lệ", details: parsed.error.issues };
    }
    const updated = await deps.automationsRepository?.update(id, req.user.id, parsed.data);
    if (!updated) {
      reply.code(404);
      return { error: "Không tìm thấy automation" };
    }
    return updated;
  });

  app.delete("/api/automations/:id", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await deps.automationsRepository?.delete(id, req.user.id);
    if (!ok) {
      reply.code(404);
      return { error: "Không tìm thấy automation" };
    }
    reply.code(204);
    return null;
  });

  app.post("/api/automations/:id/duplicate", { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const duplicated = await deps.automationsRepository?.duplicate(id, req.user.id);
    if (!duplicated) {
      reply.code(404);
      return { error: "Không tìm thấy automation" };
    }
    reply.code(201);
    return duplicated;
  });

  return app;
}
