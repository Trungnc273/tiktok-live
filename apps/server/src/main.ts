import { logger } from "./config/logger.js";
import {
  ConnectionManager,
  MockProvider,
  TikTokLiveConnectorProvider,
  type ConnectionState,
} from "./modules/tiktok-adapter/index.js";
import { normalizeAndValidate } from "./modules/event-normalizer/index.js";
import { createDb, createEventsRepository } from "./modules/persistence/index.js";

/**
 * M01+M02+M03 entrypoint thủ công: kết nối tới TikTok LIVE thật nếu có
 * TIKTOK_USERNAME trong biến môi trường, ngược lại dùng MockProvider bơm event
 * giả lập; normalize + validate; ghi vào Postgres bất đồng bộ (không chặn pipeline
 * chính nếu DB chậm/lỗi — docs/implementation/MILESTONES.md, M03).
 */

const username = process.env.TIKTOK_USERNAME;
const signApiKey = process.env.EULER_STREAM_API_KEY;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";

const provider = username
  ? new TikTokLiveConnectorProvider({ signApiKey })
  : new MockProvider();

const manager = new ConnectionManager(provider);
const db = createDb(databaseUrl);
const eventsRepository = createEventsRepository(db);

// streamId dùng chung cho LiveEvent.streamId VÀ stream_sessions.id — gán sau khi
// tạo session record, mặc định "unlinked" nếu tạo session thất bại (DB down khi khởi động).
let streamId = "unlinked";

manager.on("stateChange", (state: ConnectionState) => {
  logger.info({ state }, "tiktok-adapter state changed");
});

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
});

manager.on("connectionError", (err: Error) => {
  logger.error({ err }, "tiktok-adapter error");
});

async function main(): Promise<void> {
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

// Graceful shutdown (yêu cầu M01).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Nhận tín hiệu dừng, đang ngắt kết nối...");
    void manager.stop().then(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error({ err }, "Lỗi khởi động main()");
  process.exitCode = 1;
});
