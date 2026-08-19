import { randomUUID } from "node:crypto";

/**
 * Token store in-memory cho overlay URL — MỖI TOKEN GẮN VỚI 1 `ownerId` (tài
 * khoản nền tảng) để overlay chỉ nhận đúng dữ liệu của streamer sở hữu overlay đó
 * (multi-tenant, bổ sung sau MVP — cách ly bắt buộc, không phải tuỳ chọn).
 *
 * MVP: token không hết hạn, không bền vững qua restart — đủ dùng self-hosted quy
 * mô nhỏ; nếu cần thu hồi/khôi phục qua restart ở Phase 2, đổi implementation này
 * sang Postgres mà không ảnh hưởng OverlayGateway.
 */
export class TokenStore {
  private readonly tokenToOwner = new Map<string, string>();

  issue(ownerId: string): string {
    const token = randomUUID();
    this.tokenToOwner.set(token, ownerId);
    return token;
  }

  /** Trả `ownerId` nếu token hợp lệ, `null` nếu không (token sai/không tồn tại). */
  verify(token: unknown): string | null {
    if (typeof token !== "string") return null;
    return this.tokenToOwner.get(token) ?? null;
  }

  revoke(token: string): void {
    this.tokenToOwner.delete(token);
  }
}
