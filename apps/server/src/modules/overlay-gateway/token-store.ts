import { randomUUID } from "node:crypto";

/**
 * Token store in-memory cho overlay URL. Mỗi overlay instance có 1 token sinh
 * khi tạo URL (docs/architecture/REALTIME-ARCHITECTURE.md — Security: overlay URL
 * có thể vô tình lộ qua OBS config/screen share, nên không để mở hoàn toàn công khai).
 *
 * MVP: token không hết hạn (1 streamer, tự quản lý), không bền vững qua restart —
 * đủ dùng cho self-hosted single-instance; nếu cần thu hồi/khôi phục qua restart
 * ở Phase 2, đổi implementation này sang Postgres mà không ảnh hưởng OverlayGateway.
 */
export class TokenStore {
  private readonly tokens = new Set<string>();

  issue(): string {
    const token = randomUUID();
    this.tokens.add(token);
    return token;
  }

  verify(token: unknown): boolean {
    return typeof token === "string" && this.tokens.has(token);
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }
}
