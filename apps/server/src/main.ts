import { logger } from "./config/logger.js";
import {
  ConnectionManager,
  MockProvider,
  TikTokLiveConnectorProvider,
  type ConnectionState,
} from "./modules/tiktok-adapter/index.js";
import { normalizeAndValidate } from "./modules/event-normalizer/index.js";
import { createDb, createEventsRepository } from "./modules/persistence/index.js";
import { OverlayGateway, TokenStore } from "./modules/overlay-gateway/index.js";
import { createHttpServer } from "./modules/api/index.js";

/**
 * M01+M02+M03+M08 entrypoint thủ công: kết nối tới TikTok LIVE thật nếu có
 * TIKTOK_USERNAME trong biến môi trường, ngược lại dùng MockProvider bơm event
 * giả lập; normalize + validate; ghi vào Postgres bất đồng bộ (M03); broadcast
 * LiveEvent hợp lệ tới overlay client qua Socket.IO (M08). Rule Engine/Action
 * Engine (M04/M05) CHƯA được nối vào pipeline này — sẽ nối khi Dashboard (M10)
 * cho phép tạo automation thật, thay vì broadcast mọi event thô không điều kiện.
 */

const username = process.env.TIKTOK_USERNAME;
const signApiKey = process.env.EULER_STREAM_API_KEY;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";
const port = Number(process.env.PORT ?? 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;

const provider = username
  ? new TikTokLiveConnectorProvider({ signApiKey })
  : new MockProvider();

const manager = new ConnectionManager(provider);
const db = createDb(databaseUrl);
const eventsRepository = createEventsRepository(db);
const tokenStore = new TokenStore();
const httpApp = createHttpServer({ tokenStore, publicBaseUrl });

// streamId dùng chung cho LiveEvent.streamId VÀ stream_sessions.id — gán sau khi
// tạo session record, mặc định "unlinked" nếu tạo session thất bại (DB down khi khởi động).
let streamId = "unlinked";

manager.on("stateChange", (state: ConnectionState) => {
  logger.info({ state }, "tiktok-adapter state changed");
});

const overlayGateway = new OverlayGateway(httpApp.server, tokenStore);

manager.on("event", (event) => {
  logger.debug({ event }, "tiktok-adapter raw event");
  const result = normalizeAndValidate(event, streamId);
  if (!result.ok) {
    logger.warn({ event, error: result.error }, "event-normalizer: bỏ qua event không hợp lệ");
    return;
  }
  logger.info({ liveEvent: result.event }, "LiveEvent chuẩn hoá");

  // Fire-and-forget: KHÔNG await, KHÔNG được để lỗi DB chặn nhận event tiếp theo.
  const sessionId = streamId === "unlinked" ? null : streamId;
  eventsRepository.recordEvent(result.event, sessionId).catch((err: unknown) => {
    logger.error({ err, eventId: result.event?.id }, "persistence: ghi events_log thất bại");
  });

  overlayGateway.broadcast("liveEvent", result.event);
});

manager.on("connectionError", (err: Error) => {
  logger.error({ err }, "tiktok-adapter error");
});

async function main(): Promise<void> {
  await httpApp.listen({ port, host: "0.0.0.0" });
  const demoOverlayToken = tokenStore.issue();
  logger.info(
    { url: `${publicBaseUrl}/overlay?token=${demoOverlayToken}` },
    "HTTP+Socket.IO server sẵn sàng. Overlay demo URL (dev, chưa build apps/overlay vào server)",
  );

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
    void Promise.allSettled([manager.stop(), overlayGateway.close(), httpApp.close()]).then(() =>
      process.exit(0),
    );
  });
}

main().catch((err) => {
  logger.error({ err }, "Lỗi khởi động main()");
  process.exitCode = 1;
});
