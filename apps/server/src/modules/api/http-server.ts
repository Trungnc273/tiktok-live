import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { automationRuleSchema } from "@tiktok-live/shared-types";
import type { TokenStore } from "../overlay-gateway/index.js";
import type { AutomationsRepository, EventsRepository } from "../persistence/index.js";
import type { StatusTracker } from "./status-tracker.js";
import { validateRule } from "../rule-engine/index.js";

export interface HttpServerDeps {
  tokenStore: TokenStore;
  publicBaseUrl: string;
  mediaDir?: string;
  soundsDir?: string;
  automationsRepository?: AutomationsRepository;
  eventsRepository?: EventsRepository;
  statusTracker?: StatusTracker;
}

const createAutomationBodySchema = automationRuleSchema.omit({ id: true, createdAt: true, updatedAt: true });
const updateAutomationBodySchema = createAutomationBodySchema.partial();

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
