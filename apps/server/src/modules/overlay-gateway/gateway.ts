import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Namespace } from "socket.io";
import type { OverlayMessage } from "@tiktok-live/shared-types";
import type { TokenStore } from "./token-store.js";
import { logger } from "../../config/logger.js";

/**
 * OverlayGateway (docs/architecture/REALTIME-ARCHITECTURE.md — hoàn thiện ở M09):
 *
 *   Backend -> Socket.IO
 *               ├── namespace "/overlay"  (token-authenticated — URL có thể lộ qua OBS/screenshare)
 *               └── namespace "/dashboard" (MVP: tin tưởng theo local network, không bắt buộc token — xem ghi chú Security bên dưới)
 *
 * Reconnect + heartbeat dùng cơ chế có sẵn của Socket.IO (không tự viết lại).
 * Resync khi reconnect: server gửi ngay `sync` event kèm sequence hiện tại cho
 * client vừa connect, để SequenceGuard phía client không bị kẹt ở giá trị cũ.
 */
export class OverlayGateway {
  private readonly io: SocketIOServer;
  private sequence = 0;
  private readonly overlayNs: Namespace;
  private readonly dashboardNs: Namespace;

  constructor(httpServer: HttpServer, private readonly tokenStore: TokenStore) {
    this.io = new SocketIOServer(httpServer, {
      path: "/socket.io",
      cors: { origin: "*" }, // MVP self-hosted: overlay page có thể mở từ file:// hoặc host khác OBS proxy — thắt chặt khi triển khai production thật
    });

    this.overlayNs = this.io.of("/overlay");
    this.dashboardNs = this.io.of("/dashboard");

    this.overlayNs.use((socket, next) => {
      const token = socket.handshake.query.token;
      if (!this.tokenStore.verify(token)) {
        next(new Error("Unauthorized: token overlay không hợp lệ"));
        return;
      }
      next();
    });

    this.setupNamespace(this.overlayNs, "overlay");
    this.setupNamespace(this.dashboardNs, "dashboard");
    // GHI CHÚ SECURITY (đã ghi ở REALTIME-ARCHITECTURE.md): namespace "/dashboard"
    // KHÔNG bắt buộc token ở MVP vì chỉ chạy local/self-hosted. Nếu deploy ra VPS
    // công khai, đây là việc BẮT BUỘC phải bật token tương tự "/overlay" trước khi
    // production — chưa làm ở milestone này vì Dashboard UI (M10) chưa tồn tại.
  }

  private setupNamespace(ns: Namespace, label: string): void {
    ns.on("connection", (socket) => {
      logger.info({ socketId: socket.id, namespace: label }, "Client kết nối");
      // Resync: gửi ngay sequence hiện tại để client (mới hoặc vừa reconnect) không
      // bị kẹt ở trạng thái cũ (docs/architecture/REALTIME-ARCHITECTURE.md).
      socket.emit("sync", { sequence: this.sequence });

      socket.on("disconnect", (reason) => {
        logger.info({ socketId: socket.id, namespace: label, reason }, "Client ngắt kết nối");
      });
    });
  }

  /** Phát 1 message tới mọi overlay + dashboard client đang kết nối, gắn sequence tăng dần. */
  broadcast(type: OverlayMessage["type"], data: unknown): OverlayMessage {
    this.sequence += 1;
    const message: OverlayMessage = { sequence: this.sequence, type, data };
    this.overlayNs.emit("message", message);
    this.dashboardNs.emit("message", message);
    return message;
  }

  get connectedOverlayCount(): number {
    return this.overlayNs.sockets.size;
  }

  get connectedDashboardCount(): number {
    return this.dashboardNs.sockets.size;
  }

  async close(): Promise<void> {
    await this.io.close();
  }
}
