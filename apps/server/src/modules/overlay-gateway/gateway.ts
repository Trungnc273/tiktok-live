import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Namespace } from "socket.io";
import type { OverlayMessage } from "@tiktok-live/shared-types";
import type { TokenStore } from "./token-store.js";
import { logger } from "../../config/logger.js";

function overlayRoom(ownerId: string): string {
  return `overlay:${ownerId}`;
}
function dashboardRoom(ownerId: string): string {
  return `dashboard:${ownerId}`;
}

/**
 * OverlayGateway — multi-tenant (bổ sung sau MVP): mỗi streamer (`ownerId`) có 1
 * "phòng" (Socket.IO room) RIÊNG cho cả overlay lẫn dashboard. `broadcast()` giờ
 * BẮT BUỘC truyền `ownerId` — không còn kiểu "phát cho mọi client" như bản MVP gốc,
 * vì điều đó sẽ làm lộ dữ liệu (comment/gift...) của streamer này sang streamer khác.
 *
 * Namespace "/overlay": xác thực qua token (1-1 với `ownerId`, xem token-store.ts).
 * Namespace "/dashboard": xác thực qua JWT trong cookie (cùng cơ chế đăng nhập
 * dashboard — dashboard KHÔNG còn "tin tưởng local network" như ghi chú cũ nữa,
 * vì giờ có nhiều người dùng chung 1 server).
 */
export class OverlayGateway {
  private readonly io: SocketIOServer;
  private readonly sequenceByOwner = new Map<string, number>();
  private readonly overlayNs: Namespace;
  private readonly dashboardNs: Namespace;

  constructor(
    httpServer: HttpServer,
    private readonly tokenStore: TokenStore,
    private readonly verifyDashboardToken: (token: string) => { id: string } | null,
  ) {
    this.io = new SocketIOServer(httpServer, {
      path: "/socket.io",
      cors: { origin: "*" }, // MVP self-hosted: overlay page có thể mở từ file:// hoặc host khác OBS proxy — thắt chặt khi triển khai production thật
    });

    this.overlayNs = this.io.of("/overlay");
    this.dashboardNs = this.io.of("/dashboard");

    this.overlayNs.use((socket, next) => {
      const ownerId = this.tokenStore.verify(socket.handshake.query.token);
      if (!ownerId) {
        next(new Error("Unauthorized: token overlay không hợp lệ"));
        return;
      }
      socket.data.ownerId = ownerId;
      next();
    });

    this.dashboardNs.use((socket, next) => {
      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const token = parseCookie(cookieHeader, "token");
      const payload = token ? this.verifyDashboardToken(token) : null;
      if (!payload) {
        next(new Error("Unauthorized: chưa đăng nhập"));
        return;
      }
      socket.data.ownerId = payload.id;
      next();
    });

    this.setupNamespace(this.overlayNs, "overlay", overlayRoom);
    this.setupNamespace(this.dashboardNs, "dashboard", dashboardRoom);
  }

  private setupNamespace(ns: Namespace, label: string, roomOf: (ownerId: string) => string): void {
    ns.on("connection", (socket) => {
      const ownerId = socket.data.ownerId as string;
      void socket.join(roomOf(ownerId));
      logger.info({ socketId: socket.id, namespace: label, ownerId }, "Client kết nối");

      // Resync: gửi ngay sequence hiện tại CỦA ĐÚNG OWNER để client (mới hoặc vừa
      // reconnect) không bị kẹt ở trạng thái cũ (REALTIME-ARCHITECTURE.md).
      socket.emit("sync", { sequence: this.sequenceByOwner.get(ownerId) ?? 0 });

      socket.on("disconnect", (reason) => {
        logger.info({ socketId: socket.id, namespace: label, ownerId, reason }, "Client ngắt kết nối");
      });
    });
  }

  /** Phát 1 message tới overlay + dashboard client CỦA ĐÚNG `ownerId`, gắn sequence tăng dần riêng theo owner. */
  broadcast(ownerId: string, type: OverlayMessage["type"], data: unknown): OverlayMessage {
    const nextSequence = (this.sequenceByOwner.get(ownerId) ?? 0) + 1;
    this.sequenceByOwner.set(ownerId, nextSequence);
    const message: OverlayMessage = { sequence: nextSequence, type, data };
    this.overlayNs.to(overlayRoom(ownerId)).emit("message", message);
    this.dashboardNs.to(dashboardRoom(ownerId)).emit("message", message);
    return message;
  }

  connectedOverlayCount(ownerId: string): number {
    return this.overlayNs.adapter.rooms.get(overlayRoom(ownerId))?.size ?? 0;
  }

  async close(): Promise<void> {
    await this.io.close();
  }
}

function parseCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
