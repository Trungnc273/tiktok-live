import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { automationRuleSchema } from "@tiktok-live/shared-types";
import type { TokenStore } from "../overlay-gateway/index.js";
import type { AutomationsRepository, EventsRepository } from "../persistence/index.js";
import type { StatusTracker } from "./status-tracker.js";
import { validateRule } from "../rule-engine/index.js";
import { logger } from "../../config/logger.js";

export interface HttpServerDeps {
  tokenStore: TokenStore;
  publicBaseUrl: string;
  mediaDir?: string;
  soundsDir?: string;
  automationsRepository?: AutomationsRepository;
  eventsRepository?: EventsRepository;
  statusTracker?: StatusTracker;
  /** Ping DB thật cho /health (PHASE 14 audit M1) — ví dụ `() => db.execute(sql\`select 1\`)`. Optional để giữ test hiện có không cần DB vẫn chạy được. */
  checkDb?: () => Promise<void>;
  /** Nguồn cho phép CORS (PHASE 14 audit L2) — mặc định "*" cho dev, PHẢI thắt chặt khi deploy production thật. */
  corsOrigin?: string | string[] | boolean;
}

const createAutomationBodySchema = automationRuleSchema.omit({ id: true, createdAt: true, updatedAt: true });
const updateAutomationBodySchema = createAutomationBodySchema.partial();

export function createHttpServer(deps: HttpServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  void app.register(fastifyCors, { origin: deps.corsOrigin ?? "*" });

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

    const connectionState = deps.statusTracker?.snapshot().connectionState ?? "unknown";
    const healthy = dbOk !== false;

    reply.code(healthy ? 200 : 503);
    return { status: healthy ? "ok" : "degraded", db: dbOk, tiktokConnectionState: connectionState };
  });

  app.post("/api/overlays", async () => {
    const token = deps.tokenStore.issue();
    const url = `${deps.publicBaseUrl}/overlay?token=${token}`;
    return { token, url };
  });

  if (deps.mediaDir) {
    void app.register(fastifyStatic, { root: deps.mediaDir, prefix: "/media/", decorateReply: false });
  }
  if (deps.soundsDir) {
    void app.register(fastifyStatic, { root: deps.soundsDir, prefix: "/sounds/", decorateReply: false });
  }

  // --- Dashboard: status & recent events (M10) ---

  app.get("/api/status", async () => {
    return deps.statusTracker?.snapshot() ?? { connectionState: "idle", viewerCount: null, counts: {} };
  });

  app.get("/api/events/recent", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 20);
    return deps.eventsRepository?.getRecent(Math.min(limit, 100)) ?? [];
  });

  // --- Automations CRUD (M10) ---

  app.get("/api/automations", async () => {
    return (await deps.automationsRepository?.list()) ?? [];
  });

  app.post("/api/automations", async (req, reply) => {
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

    const created = await deps.automationsRepository?.create(parsed.data);
    reply.code(201);
    return created;
  });

  app.put("/api/automations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateAutomationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Dữ liệu automation không hợp lệ", details: parsed.error.issues };
    }
    const updated = await deps.automationsRepository?.update(id, parsed.data);
    if (!updated) {
      reply.code(404);
      return { error: "Không tìm thấy automation" };
    }
    return updated;
  });

  app.delete("/api/automations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await deps.automationsRepository?.delete(id);
    if (!ok) {
      reply.code(404);
      return { error: "Không tìm thấy automation" };
    }
    reply.code(204);
    return null;
  });

  app.post("/api/automations/:id/duplicate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const duplicated = await deps.automationsRepository?.duplicate(id);
    if (!duplicated) {
      reply.code(404);
      return { error: "Không tìm thấy automation" };
    }
    reply.code(201);
    return duplicated;
  });

  return app;
}
