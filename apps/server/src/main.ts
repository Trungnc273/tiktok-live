import { logger } from "./config/logger.js";
import {
  ConnectionManager,
  MockProvider,
  TikTokLiveConnectorProvider,
  type ConnectionState,
} from "./modules/tiktok-adapter/index.js";

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

manager.on("event", (event) => {
  logger.info({ event }, "tiktok-adapter raw event");
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
      mockProvider.emitFakeEvent("chat", {
        comment: "hello",
        user: { uniqueId: "test_user" },
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
