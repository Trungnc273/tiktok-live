import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { sql } from "drizzle-orm";
import { logger } from "./config/logger.js";
import {
  ConnectionManager,
  MockProvider,
  TikTokLiveConnectorProvider,
  type ConnectionState,
} from "./modules/tiktok-adapter/index.js";
import { normalizeAndValidate } from "./modules/event-normalizer/index.js";
import {
  createDb,
  createEventsRepository,
  createAutomationsRepository,
  createExecutionLogPort,
} from "./modules/persistence/index.js";
import { OverlayGateway, TokenStore } from "./modules/overlay-gateway/index.js";
import { createHttpServer, StatusTracker } from "./modules/api/index.js";
import { evaluateRules } from "./modules/rule-engine/index.js";
import { ActionDispatcher, HandlerRegistry } from "./modules/action-engine/index.js";
import { createTTSActionHandler, WindowsSapiProvider, TTSQueue } from "./modules/tts/index.js";
import { createSoundActionHandler } from "./modules/audio/index.js";
import { OBSService, createOBSSceneChangeActionHandler } from "./modules/obs/index.js";

/**
 * Entrypoint đầy đủ M01→M10: kết nối TikTok LIVE (thật hoặc mock) -> normalize ->
 * ghi Postgres -> broadcast overlay -> Rule Engine đọc automation thật từ DB ->
 * Action Engine dispatch -> TTS/Sound -> broadcast audio URL tới overlay.
 */

const username = process.env.TIKTOK_USERNAME;
const signApiKey = process.env.EULER_STREAM_API_KEY;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";
const port = Number(process.env.PORT ?? 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const mediaDir = process.env.MEDIA_DIR ?? join(process.cwd(), ".media");
const soundsDir = process.env.SOUNDS_DIR ?? join(process.cwd(), "sounds");

const provider = username
  ? new TikTokLiveConnectorProvider({ signApiKey })
  : new MockProvider();

const manager = new ConnectionManager(provider);
const db = createDb(databaseUrl);
const eventsRepository = createEventsRepository(db);
const automationsRepository = createAutomationsRepository(db);
const executionLogPort = createExecutionLogPort(db);
const statusTracker = new StatusTracker();
const tokenStore = new TokenStore();
const httpApp = createHttpServer({
  tokenStore,
  publicBaseUrl,
  mediaDir,
  soundsDir,
  automationsRepository,
  eventsRepository,
  statusTracker,
  checkDb: () => db.execute(sql`select 1`).then(() => undefined),
  // Mặc định "*" cho dev self-hosted; đặt CORS_ORIGIN thật khi deploy production
  // (PHASE 14 audit L2) — ví dụ domain của apps/dashboard đã build.
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
});

const overlayGateway = new OverlayGateway(httpApp.server, tokenStore);

const handlerRegistry = new HandlerRegistry();
handlerRegistry.register(
  createTTSActionHandler(new WindowsSapiProvider(), new TTSQueue(), {
    outputDir: mediaDir,
    onAudioReady: (filePath) => {
      overlayGateway.broadcast("ttsReady", { url: `${publicBaseUrl}/media/${basename(filePath)}` });
    },
  }),
);
handlerRegistry.register(
  createSoundActionHandler({
    soundsDir,
    onSoundReady: (filePath) => {
      overlayGateway.broadcast("soundReady", { url: `${publicBaseUrl}/sounds/${basename(filePath)}` });
    },
  }),
);
// OBS (M11) — CHỈ đăng ký handler nếu có cấu hình OBS_WEBSOCKET_URL, vì:
// (a) không bắt buộc với mọi streamer, (b) môi trường dev hiện tại KHÔNG có OBS
// Studio thật cài sẵn để test real connection (xem M11-REPORT.md) — không đăng ký
// mù quáng handler cho 1 service chưa xác nhận kết nối được.
const obsService = new OBSService();
if (process.env.OBS_WEBSOCKET_URL) {
  handlerRegistry.register(createOBSSceneChangeActionHandler(obsService));
}

const actionDispatcher = new ActionDispatcher(handlerRegistry, executionLogPort);

// streamId dùng chung cho LiveEvent.streamId VÀ stream_sessions.id — gán sau khi
// tạo session record, mặc định "unlinked" nếu tạo session thất bại (DB down khi khởi động).
let streamId = "unlinked";

manager.on("stateChange", (state: ConnectionState) => {
  logger.info({ state }, "tiktok-adapter state changed");
  statusTracker.setConnectionState(state);
});

manager.on("event", (event) => {
  logger.debug({ event }, "tiktok-adapter raw event");
  const result = normalizeAndValidate(event, streamId);
  if (!result.ok) {
    logger.warn({ event, error: result.error }, "event-normalizer: bỏ qua event không hợp lệ");
    return;
  }
  const liveEvent = result.event;
  logger.info({ liveEvent }, "LiveEvent chuẩn hoá");
  statusTracker.recordEvent(liveEvent);

  // Fire-and-forget: KHÔNG await, KHÔNG được để lỗi DB chặn nhận event tiếp theo.
  const sessionId = streamId === "unlinked" ? null : streamId;
  eventsRepository.recordEvent(liveEvent, sessionId).catch((err: unknown) => {
    logger.error({ err, eventId: liveEvent.id }, "persistence: ghi events_log thất bại");
  });

  overlayGateway.broadcast("liveEvent", liveEvent);

  // Rule Engine (M04) -> Action Engine (M05) — đọc automation thật từ DB mỗi event.
  // MVP: chưa cache in-memory (đơn giản hơn, đủ cho 1 streamer); nếu volume cao gây
  // nghẽn, cân nhắc cache + invalidate khi CRUD automation ở Phase 2.
  automationsRepository
    .list()
    .then((rules) => {
      const matches = evaluateRules(rules, liveEvent);
      for (const match of matches) {
        void actionDispatcher
          .dispatch(match, { ruleId: match.ruleId, ruleName: match.ruleName, event: liveEvent })
          .catch((err: unknown) => {
            logger.error({ err, ruleId: match.ruleId }, "action-dispatcher: lỗi không mong đợi");
          });
      }
    })
    .catch((err: unknown) => {
      logger.error({ err }, "rule-engine: không đọc được automations từ DB");
    });
});

manager.on("connectionError", (err: Error) => {
  logger.error({ err }, "tiktok-adapter error");
});

async function main(): Promise<void> {
  await mkdir(mediaDir, { recursive: true });
  await mkdir(soundsDir, { recursive: true });

  await httpApp.listen({ port, host: "0.0.0.0" });
  const demoOverlayToken = tokenStore.issue();
  logger.info(
    { url: `${publicBaseUrl}/overlay?token=${demoOverlayToken}` },
    "HTTP+Socket.IO server sẵn sàng. Overlay demo URL (dev, chưa build apps/overlay vào server)",
  );

  if (process.env.OBS_WEBSOCKET_URL) {
    try {
      await obsService.connect({ url: process.env.OBS_WEBSOCKET_URL, password: process.env.OBS_WEBSOCKET_PASSWORD });
      logger.info("Đã kết nối OBS WebSocket");
    } catch (err) {
      // Không chặn khởi động server nếu OBS không kết nối được (streamer có thể
      // chưa mở OBS lúc start) — action obs.sceneChange sẽ tự báo lỗi khi dispatch.
      logger.error({ err }, "Không kết nối được OBS WebSocket lúc khởi động — sẽ không chặn server chạy tiếp");
    }
  }

  try {
    streamId = await eventsRepository.createStreamSession(username ?? "mock-user");
    logger.info({ streamId }, "Đã tạo stream session trong Postgres");
  } catch (err) {
    // DB không khả dụng lúc khởi động không được chặn việc nhận event TikTok
    // (NFR: mất kết nối DB tạm thời không làm dừng pipeline chính) — chỉ log cảnh
    // báo, event vẫn được nhận + normalize, chỉ không gắn được vào 1 session cụ thể.
    logger.error({ err }, "Không tạo được stream session (DB có thể chưa sẵn sàng) — tiếp tục chạy không gắn session");
  }

  if (username) {
    logger.info({ username }, "Kết nối tới TikTok LIVE thật");
    await manager.connect(username);
  } else {
    logger.warn(
      "Không có TIKTOK_USERNAME trong .env — dùng MockProvider. " +
        "Đặt TIKTOK_USERNAME + EULER_STREAM_API_KEY để test với phòng live thật.",
    );
    await manager.connect("mock-user");
    const mockProvider = provider as MockProvider;
    // Bơm 1 event mẫu để chứng minh pipeline nhận được — chỉ phục vụ dev, không phải test tự động.
    setInterval(() => {
      // Field names khớp WebcastChatMessage thật (content, user.uniqueId) — xem
      // apps/server/src/modules/event-normalizer/normalize.ts.
      mockProvider.emitFakeEvent("chat", {
        content: "hello",
        user: { id: "1", uniqueId: "test_user" },
      });
    }, 5000);
  }
}

// Graceful shutdown (yêu cầu M01, mở rộng đóng cả overlay-gateway/HTTP server ở M08).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Nhận tín hiệu dừng, đang ngắt kết nối...");
    void Promise.allSettled([
      manager.stop(),
      overlayGateway.close(),
      httpApp.close(),
      obsService.disconnect(),
    ]).then(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error({ err }, "Lỗi khởi động main()");
  process.exitCode = 1;
});
