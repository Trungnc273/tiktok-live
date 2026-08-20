import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";
import { automationRuleSchema } from "@tiktok-live/shared-types";
import type { TokenStore } from "../overlay-gateway/index.js";
import type { AutomationsRepository, EventsRepository, UsersRepository } from "../persistence/index.js";
import type { StatusTracker } from "./status-tracker.js";
import { validateRule } from "../rule-engine/index.js";
import { logger } from "../../config/logger.js";
import { registerAuthPlugin, registerAuthRoutes, registerAdminRoutes } from "../auth/index.js";
import type { LiveSessionManager } from "../live-session/index.js";
import type { TTSProvider } from "../tts/index.js";
import type { TranslationProvider } from "../translation/index.js";
import type { OverlayGateway } from "../overlay-gateway/index.js";
import { BUILTIN_SOUNDS } from "../audio/index.js";

export interface HttpServerDeps {
  tokenStore: TokenStore;
  publicBaseUrl: string;
  mediaDir?: string;
  soundsDir?: string;
  /** Thư mục `apps/overlay/dist` đã build (production) — phục vụ tĩnh tại /overlay/ để mở trực tiếp trên điện thoại thứ 2 (không cần chạy Vite dev server riêng). Optional cho dev/test. */
  overlayAppDir?: string;
  /** Thư mục `apps/dashboard/dist` đã build — phục vụ tĩnh tại "/". Optional cho dev/test. */
  dashboardAppDir?: string;
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
  /** Cho phép "nghe thử" TTS trước khi lưu automation (POST /api/tts/preview) — optional, không có thì route trả 503. */
  ttsProvider?: TTSProvider;
  /** Dịch bình luận + trả lời (POST /api/live-comment/*) — optional, không có thì route trả 503. */
  translationProvider?: TranslationProvider;
  /**
   * Box giống liveSessionManagerBox — cần OverlayGateway để BROADCAST (không chỉ
   * trả URL như /api/tts/preview) audio đọc bình luận/trả lời ra overlay thật.
   */
  overlayGatewayBox?: { current: OverlayGateway | null };
}

const createAutomationBodySchema = automationRuleSchema.omit({ id: true, createdAt: true, updatedAt: true });
const updateAutomationBodySchema = createAutomationBodySchema.partial();

export async function createHttpServer(deps: HttpServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: deps.corsOrigin ?? "*" });
  // Giới hạn 8MB/file — đủ cho sound effect ngắn (mp3/wav vài giây tới ~1 phút),
  // chặn upload file khổng lồ chiếm dung lượng VPS (yêu cầu: "upload từ điện thoại, máy tính").
  await app.register(fastifyMultipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
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

  // "Nghe thử" (docs người dùng yêu cầu: "nghe trước hiệu ứng... đảm bảo dễ dùng")
  // — synth TRỰC TIẾP bằng đúng TTSProvider thật đang chạy trên server (không phải
  // Web Speech API của trình duyệt, vì giọng/phát âm tiếng Việt sẽ khác hẳn giọng
  // thật lúc live), KHÔNG đi qua TTSQueue (đây là hành động tương tác của người
  // dùng trong lúc soạn form, không phải phản ứng theo sự kiện live -> không cần
  // và không nên xếp hàng chung với TTS thật của rule đang chạy).
  const previewBodySchema = z.object({ text: z.string().trim().min(1).max(200), lang: z.string().optional() });
  app.post("/api/tts/preview", { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = previewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Nội dung nghe thử không hợp lệ (1-200 ký tự)" };
    }
    if (!deps.ttsProvider || !deps.mediaDir) {
      reply.code(503);
      return { error: "Chức năng nghe thử chưa sẵn sàng" };
    }
    const outFilePath = join(deps.mediaDir, `tts-preview-${randomUUID()}.wav`);
    try {
      await deps.ttsProvider.synthesizeToFile(parsed.data.text, outFilePath, { lang: parsed.data.lang });
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Không tạo được audio nghe thử" };
    }
    return { url: `${deps.publicBaseUrl}/media/${basename(outFilePath)}` };
  });

  // "Đọc & dịch bình luận" + "Trả lời" (yêu cầu người dùng: streamer tự chọn TỪNG
  // bình luận cụ thể lúc live để dịch+đọc, và dịch câu trả lời sang ngôn ngữ người
  // chat rồi đọc lại bằng giọng đúng ngôn ngữ đó — KHÔNG tự động cho mọi comment,
  // đây là action thủ công 1 lần, không đi qua Automation/Rule Engine.
  const translateCommentBodySchema = z.object({
    text: z.string().trim().min(1).max(500),
    nickname: z.string().trim().max(100).optional(),
  });
  app.post("/api/live-comment/translate", { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = translateCommentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Nội dung bình luận không hợp lệ (1-500 ký tự)" };
    }
    if (!deps.translationProvider || !deps.ttsProvider || !deps.mediaDir) {
      reply.code(503);
      return { error: "Chức năng dịch bình luận chưa sẵn sàng (thiếu cấu hình dịch/TTS)" };
    }

    let translation;
    try {
      translation = await deps.translationProvider.translate(parsed.data.text, "vi");
    } catch (err) {
      reply.code(502);
      return { error: err instanceof Error ? err.message : "Dịch thất bại" };
    }

    const spoken = parsed.data.nickname
      ? `${parsed.data.nickname} nói: ${translation.translatedText}`
      : translation.translatedText;
    const outFilePath = join(deps.mediaDir, `comment-${randomUUID()}.wav`);
    try {
      await deps.ttsProvider.synthesizeToFile(spoken, outFilePath, { lang: "vi" });
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Không tạo được audio đọc bình luận" };
    }

    const url = `${deps.publicBaseUrl}/media/${basename(outFilePath)}`;
    deps.overlayGatewayBox?.current?.broadcast(req.user.id, "ttsReady", { url });

    return { translatedText: translation.translatedText, detectedSourceLang: translation.detectedSourceLang, url };
  });

  const replyCommentBodySchema = z.object({
    text: z.string().trim().min(1).max(500),
    targetLang: z.string().trim().min(2).max(10),
  });
  app.post("/api/live-comment/reply", { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = replyCommentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Nội dung trả lời không hợp lệ (1-500 ký tự)" };
    }
    if (!deps.translationProvider || !deps.ttsProvider || !deps.mediaDir) {
      reply.code(503);
      return { error: "Chức năng trả lời chưa sẵn sàng (thiếu cấu hình dịch/TTS)" };
    }

    let translation;
    try {
      // source="vi" cố định — người dùng luôn gõ trả lời bằng tiếng Việt (theo yêu cầu).
      translation = await deps.translationProvider.translate(parsed.data.text, parsed.data.targetLang, "vi");
    } catch (err) {
      reply.code(502);
      return { error: err instanceof Error ? err.message : "Dịch thất bại" };
    }

    const outFilePath = join(deps.mediaDir, `reply-${randomUUID()}.wav`);
    try {
      await deps.ttsProvider.synthesizeToFile(translation.translatedText, outFilePath, {
        lang: parsed.data.targetLang,
      });
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : "Không tạo được audio đọc trả lời" };
    }

    const url = `${deps.publicBaseUrl}/media/${basename(outFilePath)}`;
    deps.overlayGatewayBox?.current?.broadcast(req.user.id, "ttsReady", { url });

    return { translatedText: translation.translatedText, url };
  });

  app.post("/api/overlays", { preHandler: app.authenticate }, async (req) => {
    const token = deps.tokenStore.issue(req.user.id);
    const url = `${deps.publicBaseUrl}/overlay/?token=${token}`;
    return { token, url };
  });

  if (deps.mediaDir) {
    void app.register(fastifyStatic, { root: deps.mediaDir, prefix: "/media/", decorateReply: false });
  }
  if (deps.soundsDir) {
    void app.register(fastifyStatic, { root: deps.soundsDir, prefix: "/sounds/", decorateReply: false });
  }

  // --- Thư viện sound: có sẵn hệ thống (builtin) + upload từ điện thoại/máy tính ---

  const UPLOAD_EXTENSIONS = new Set([".mp3", ".wav"]); // khớp SUPPORTED_EXTENSIONS ở validate-sound-file.ts
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

  app.get("/api/sounds", { preHandler: app.authenticate }, async (_req, reply) => {
    if (!deps.soundsDir) {
      reply.code(503);
      return { error: "Chưa cấu hình thư mục sound" };
    }
    let uploaded: string[] = [];
    try {
      const entries = await readdir(deps.soundsDir, { withFileTypes: true });
      // Chỉ liệt kê file NẰM TRỰC TIẾP trong soundsDir (không đệ quy vào builtin/)
      // — file trong builtin/ đã có sẵn trong BUILTIN_SOUNDS, tránh liệt kê trùng.
      uploaded = entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch (err) {
      logger.error({ err }, "GET /api/sounds: không đọc được soundsDir");
    }
    return { builtin: BUILTIN_SOUNDS, uploaded };
  });

  app.post("/api/sounds/upload", { preHandler: app.authenticate }, async (req, reply) => {
    if (!deps.soundsDir) {
      reply.code(503);
      return { error: "Chưa cấu hình thư mục sound" };
    }

    const data = await req.file();
    if (!data) {
      reply.code(400);
      return { error: "Thiếu file để upload" };
    }

    const ext = extname(data.filename).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) {
      // Vẫn phải drain stream trước khi trả lời, không thì Fastify treo request.
      await data.file.resume();
      reply.code(400);
      return { error: `Định dạng "${ext || "?"}" không hỗ trợ (chỉ .mp3, .wav)` };
    }

    // Tên file sinh ngẫu nhiên (KHÔNG dùng tên gốc người dùng upload) — tránh path
    // traversal / ký tự đặc biệt, và tránh 2 người dùng vô tình ghi đè file của nhau
    // (mọi user hiện dùng chung 1 soundsDir — xem ghi chú soundsDir ở main.ts).
    await mkdir(deps.soundsDir, { recursive: true });
    const safeName = `upload-${randomUUID()}${ext}`;
    const outPath = join(deps.soundsDir, safeName);

    try {
      await pipeline(data.file, createWriteStream(outPath));
    } catch (err) {
      await rm(outPath, { force: true });
      logger.error({ err }, "POST /api/sounds/upload: ghi file thất bại");
      reply.code(500);
      return { error: "Không lưu được file" };
    }

    if (data.file.truncated) {
      // Vượt quá fileSize limit đã cấu hình ở fastifyMultipart -> xoá phần dở, báo lỗi rõ ràng.
      await rm(outPath, { force: true });
      reply.code(413);
      return { error: `File quá lớn (tối đa ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` };
    }

    return { file: safeName };
  });
  if (deps.overlayAppDir) {
    void app.register(fastifyStatic, {
      root: deps.overlayAppDir,
      prefix: "/overlay/",
      decorateReply: false,
      index: ["index.html"],
    });
  }
  if (deps.dashboardAppDir) {
    void app.register(fastifyStatic, {
      root: deps.dashboardAppDir,
      prefix: "/",
      decorateReply: false,
      index: ["index.html"],
    });
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
    // Không còn chặn cứng khi đã có phiên đang chạy — LiveSessionManager.start()
    // tự nhận biết đổi kênh (username khác phiên đang chạy) và tự dừng phiên cũ
    // trước khi bắt đầu phiên mới. Chỉ báo lỗi khi user bấm start lại ĐÚNG kênh
    // đang xem (thật sự trùng, không phải đổi kênh).
    try {
      await deps.liveSessionManagerBox.current.start(req.user.id, user.tiktokUsername);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không khởi động được phiên theo dõi";
      reply.code(message.includes("Đã đang theo dõi kênh này") ? 409 : 500);
      return { error: message };
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
    const snapshot = tracker?.snapshot() ?? { connectionState: "idle", viewerCount: null, counts: {} };
    // Username thật đang được theo dõi (có thể khác username đã lưu trong hồ sơ
    // nếu người dùng vừa đổi nhưng chưa bấm "Bắt đầu theo dõi" lại) — để dashboard
    // hiển thị đúng, tránh hiểu nhầm đang xem kênh nào.
    const activeTikTokUsername = deps.liveSessionManagerBox?.current?.getActiveTikTokUsername(req.user.id) ?? null;
    return { ...snapshot, activeTikTokUsername };
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
