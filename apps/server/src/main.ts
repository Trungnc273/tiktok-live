import { mkdir, access } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { logger } from "./config/logger.js";
import {
  createDb,
  createEventsRepository,
  createAutomationsRepository,
  createExecutionLogPort,
  createUsersRepository,
} from "./modules/persistence/index.js";
import { OverlayGateway, TokenStore } from "./modules/overlay-gateway/index.js";
import { createHttpServer, StatusTracker } from "./modules/api/index.js";
import { ActionDispatcher, HandlerRegistry } from "./modules/action-engine/index.js";
import {
  createTTSActionHandler,
  WindowsSapiProvider,
  LinuxEspeakProvider,
  MockTTSProvider,
  TTSQueue,
  type TTSProvider,
} from "./modules/tts/index.js";
import { createSoundActionHandler } from "./modules/audio/index.js";
import { OBSService, createOBSSceneChangeActionHandler } from "./modules/obs/index.js";
import { verifyJwtToken } from "./modules/auth/index.js";
import { LiveSessionManager } from "./modules/live-session/index.js";

/**
 * Entrypoint multi-tenant (bổ sung sau MVP): server KHÔNG còn tự kết nối 1 phòng
 * TikTok LIVE cố định khi khởi động — mỗi user tự đăng nhập, cấu hình
 * `tiktokUsername` của mình (PUT /api/auth/tiktok-username), rồi bấm "bắt đầu theo
 * dõi" (POST /api/live/start). `LiveSessionManager` quản lý nhiều kết nối TikTok
 * đồng thời, mỗi kết nối 1 user, độc lập hoàn toàn.
 */

const signApiKey = process.env.EULER_STREAM_API_KEY;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";
const port = Number(process.env.PORT ?? 3000);
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
const mediaDir = process.env.MEDIA_DIR ?? join(process.cwd(), ".media");
const soundsDir = process.env.SOUNDS_DIR ?? join(process.cwd(), "sounds");
const jwtSecret = process.env.JWT_SECRET ?? randomBytes(32).toString("hex");
const secureCookie = process.env.NODE_ENV === "production";
// MOCK_TIKTOK=1 (dev/test): mọi session dùng MockProvider bơm event giả lập thay
// vì kết nối TikTok thật — tiện test nhiều "streamer" mà không cần nhiều tài khoản
// TikTok thật đang live cùng lúc.
const useMockProvider = process.env.MOCK_TIKTOK === "1";

/**
 * Chọn TTS provider theo hệ điều hành thật (không cần cấu hình thủ công) — có thể
 * override bằng TTS_PROVIDER=windows|linux|mock. WindowsSapiProvider verify thật ở
 * M06 (audio thật 141-240KB). LinuxEspeakProvider verify thật bằng Docker container
 * Node.js Linux (audio thật 174KB, tiếng Việt có dấu) — xem docs/reports.
 */
function createTtsProvider(): TTSProvider {
  const override = process.env.TTS_PROVIDER;
  if (override === "mock") return new MockTTSProvider();
  if (override === "windows") return new WindowsSapiProvider();
  if (override === "linux") return new LinuxEspeakProvider();
  return process.platform === "win32" ? new WindowsSapiProvider() : new LinuxEspeakProvider();
}

if (!process.env.JWT_SECRET) {
  logger.warn(
    "Không có JWT_SECRET trong .env — dùng secret ngẫu nhiên (đổi sau mỗi lần restart, " +
      "mọi người dùng bị đăng xuất). Đặt JWT_SECRET cố định trong .env cho môi trường thật.",
  );
}

const db = createDb(databaseUrl);
const eventsRepository = createEventsRepository(db);
const automationsRepository = createAutomationsRepository(db);
const executionLogPort = createExecutionLogPort(db);
const usersRepository = createUsersRepository(db);
const statusTrackers = new Map<string, StatusTracker>();
const tokenStore = new TokenStore();

// Box gián tiếp cho LiveSessionManager — xem ghi chú trong http-server.ts
// (LiveSessionManager cần OverlayGateway, OverlayGateway cần http.Server thật, chỉ
// có sau khi createHttpServer() resolve — vòng phụ thuộc khởi tạo, giải quyết bằng
// 1 box gán giá trị SAU khi mọi thứ đã sẵn sàng thay vì cố tái cấu trúc thành 1 vòng
// import lẫn nhau giữa 3 module).
const liveSessionManagerBox: { current: LiveSessionManager | null } = { current: null };

const handlerRegistry = new HandlerRegistry();
const obsService = new OBSService();
if (process.env.OBS_WEBSOCKET_URL) {
  handlerRegistry.register(createOBSSceneChangeActionHandler(obsService));
}
const actionDispatcher = new ActionDispatcher(handlerRegistry, executionLogPort);

async function dirIfExists(path: string): Promise<string | undefined> {
  try {
    await access(path);
    return path;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  await mkdir(mediaDir, { recursive: true });
  await mkdir(soundsDir, { recursive: true });

  // Phục vụ tĩnh apps/overlay/dist + apps/dashboard/dist (đã `npm run build`) nếu
  // có sẵn — cho phép mở toàn bộ hệ thống qua 1 URL duy nhất (tiện demo qua ngrok/VPS
  // mà không cần chạy riêng 2 Vite dev server). Không bắt buộc: nếu chưa build,
  // server vẫn chạy bình thường (dev dùng `npm run dev --workspace=apps/dashboard`).
  const overlayAppDir = await dirIfExists(
    process.env.OVERLAY_APP_DIR ?? join(process.cwd(), "..", "overlay", "dist"),
  );
  const dashboardAppDir = await dirIfExists(
    process.env.DASHBOARD_APP_DIR ?? join(process.cwd(), "..", "dashboard", "dist"),
  );

  const httpApp = await createHttpServer({
    tokenStore,
    publicBaseUrl,
    mediaDir,
    soundsDir,
    overlayAppDir,
    dashboardAppDir,
    automationsRepository,
    eventsRepository,
    usersRepository,
    statusTrackers,
    liveSessionManagerBox,
    checkDb: () => db.execute(sql`select 1`).then(() => undefined),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    jwtSecret,
    secureCookie,
  });

  const overlayGateway = new OverlayGateway(httpApp.server, tokenStore, (token) =>
    verifyJwtToken(jwtSecret, token),
  );

  handlerRegistry.register(
    createTTSActionHandler(createTtsProvider(), new TTSQueue(), {
      outputDir: mediaDir,
      onAudioReady: (filePath, ctx) => {
        overlayGateway.broadcast(ctx.ownerId, "ttsReady", {
          url: `${publicBaseUrl}/media/${basename(filePath)}`,
        });
      },
    }),
  );
  handlerRegistry.register(
    createSoundActionHandler({
      soundsDir,
      onSoundReady: (filePath, ctx) => {
        overlayGateway.broadcast(ctx.ownerId, "soundReady", {
          url: `${publicBaseUrl}/sounds/${basename(filePath)}`,
        });
      },
    }),
  );

  const liveSessionManager = new LiveSessionManager({
    eulerStreamApiKey: signApiKey,
    eventsRepository,
    automationsRepository,
    actionDispatcher,
    overlayGateway,
    statusTrackers,
    useMockProvider,
  });
  liveSessionManagerBox.current = liveSessionManager;

  await httpApp.listen({ port, host: "0.0.0.0" });
  logger.info({ publicBaseUrl, useMockProvider }, "HTTP+Socket.IO server multi-tenant sẵn sàng.");

  if (process.env.OBS_WEBSOCKET_URL) {
    try {
      await obsService.connect({ url: process.env.OBS_WEBSOCKET_URL, password: process.env.OBS_WEBSOCKET_PASSWORD });
      logger.info("Đã kết nối OBS WebSocket");
    } catch (err) {
      logger.error({ err }, "Không kết nối được OBS WebSocket lúc khởi động — sẽ không chặn server chạy tiếp");
    }
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      logger.info({ signal }, "Nhận tín hiệu dừng, đang ngắt mọi phiên theo dõi...");
      void Promise.allSettled([
        liveSessionManager.stopAll(),
        overlayGateway.close(),
        httpApp.close(),
        obsService.disconnect(),
      ]).then(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  logger.error({ err }, "Lỗi khởi động main()");
  process.exitCode = 1;
});
