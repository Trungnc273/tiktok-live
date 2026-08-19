import { randomUUID } from "node:crypto";
import { logger } from "./config/logger.js";
import {
  ConnectionManager,
  MockProvider,
  TikTokLiveConnectorProvider,
  type ConnectionState,
} from "./modules/tiktok-adapter/index.js";
import { normalizeAndValidate } from "./modules/event-normalizer/index.js";

/**
 * M01 entrypoint thủ công: kết nối tới TikTok LIVE thật nếu có TIKTOK_USERNAME
 * trong biến môi trường, ngược lại dùng MockProvider bơm event giả lập để dev
 * không có phòng live thật vẫn thấy pipeline chạy được (docs/implementation/MILESTONES.md — M01).
 */

const username = process.env.TIKTOK_USERNAME;
const signApiKey = process.env.EULER_STREAM_API_KEY;

const provider = username
  ? new TikTokLiveConnectorProvider({ signApiKey })
  : new MockProvider();

const manager = new ConnectionManager(provider);

manager.on("stateChange", (state: ConnectionState) => {
  logger.info({ state }, "tiktok-adapter state changed");
});

const streamId = randomUUID();

manager.on("event", (event) => {
  logger.debug({ event }, "tiktok-adapter raw event");
  const result = normalizeAndValidate(event, streamId);
  if (!result.ok) {
    logger.warn({ event, error: result.error }, "event-normalizer: bỏ qua event không hợp lệ");
    return;
  }
  logger.info({ liveEvent: result.event }, "LiveEvent chuẩn hoá");
});

manager.on("connectionError", (err: Error) => {
  logger.error({ err }, "tiktok-adapter error");
});

async function main(): Promise<void> {
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
