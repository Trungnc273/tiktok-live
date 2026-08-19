import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type { OverlayMessage } from "@tiktok-live/shared-types";
import type { TokenStore } from "./token-store.js";
import { logger } from "../../config/logger.js";

/**
 * OverlayGateway (docs/architecture/REALTIME-ARCHITECTURE.md — M08 khung cơ bản,
 * hoàn thiện sequence/dedup/resync đầy đủ ở M09):
 *
 *   Backend -> Socket.IO namespace "/overlay" (token-authenticated) -> Overlay browser
 *
 * Reconnect + heartbeat dùng cơ chế có sẵn của Socket.IO (không tự viết lại).
 */
export class OverlayGateway {
  private readonly io: SocketIOServer;
  private sequence = 0;

  constructor(httpServer: HttpServer, private readonly tokenStore: TokenStore) {
    this.io = new SocketIOServer(httpServer, {
      path: "/socket.io",
      cors: { origin: "*" }, // MVP self-hosted: overlay page có thể mở từ file:// hoặc host khác OBS proxy — thắt chặt khi triển khai production thật
    });

    const overlayNamespace = this.io.of("/overlay");

    overlayNamespace.use((socket, next) => {
      const token = socket.handshake.query.token;
      if (!this.tokenStore.verify(token)) {
        next(new Error("Unauthorized: token overlay không hợp lệ"));
        return;
      }
      next();
    });

    overlayNamespace.on("connection", (socket) => {
      logger.info({ socketId: socket.id }, "Overlay client kết nối");
      socket.on("disconnect", (reason) => {
        logger.info({ socketId: socket.id, reason }, "Overlay client ngắt kết nối");
      });
    });
  }

  /** Phát 1 message tới mọi overlay client đang kết nối, gắn sequence tăng dần. */
  broadcast(type: OverlayMessage["type"], data: unknown): OverlayMessage {
    this.sequence += 1;
    const message: OverlayMessage = { sequence: this.sequence, type, data };
    this.io.of("/overlay").emit("message", message);
    return message;
  }

  get connectedOverlayCount(): number {
    return this.io.of("/overlay").sockets.size;
  }

  async close(): Promise<void> {
    await this.io.close();
  }
}
