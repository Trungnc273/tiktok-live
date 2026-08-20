import type { ConnectionState } from "../tiktok-adapter/index.js";
import type { LiveEvent } from "@tiktok-live/shared-types";

export interface StatusSnapshot {
  connectionState: ConnectionState;
  viewerCount: number | null;
  counts: { follow: number; like: number; comment: number; share: number; gift: number };
}

/**
 * Đếm số liệu hiển thị Dashboard (docs/promp/PHASE_11.md — "LIVE status, current
 * viewers, likes, comments, gifts"). In-memory, reset khi restart process — đủ cho
 * MVP 1 phiên live tại 1 thời điểm, không cần bền vững qua restart.
 */
export class StatusTracker {
  private connectionState: ConnectionState = "idle";
  private viewerCount: number | null = null;
  private counts = { follow: 0, like: 0, comment: 0, share: 0, gift: 0 };

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
  }

  recordEvent(event: LiveEvent): void {
    if (event.type === "join" && event.payload.viewerCount !== undefined) {
      this.viewerCount = event.payload.viewerCount;
    }
    if (event.type === "like") {
      this.counts.like += event.payload.count;
    } else if (event.type in this.counts) {
      this.counts[event.type as keyof typeof this.counts] += 1;
    }
  }

  snapshot(): StatusSnapshot {
    return {
      connectionState: this.connectionState,
      viewerCount: this.viewerCount,
      counts: { ...this.counts },
    };
  }

  /**
   * Đưa về trạng thái ban đầu — bắt buộc phải gọi khi bắt đầu 1 phiên theo dõi
   * MỚI (kể cả cùng owner đổi sang TikTok ID khác), vì LiveSessionManager tái sử
   * dụng CÙNG 1 instance StatusTracker theo ownerId xuyên suốt các phiên. Không
   * reset thì số liệu (follow/like/comment/gift) của live cũ sẽ cộng dồn sang
   * live mới — bug thật đã gặp khi người dùng đổi TikTok username giữa chừng.
   */
  reset(): void {
    this.connectionState = "idle";
    this.viewerCount = null;
    this.counts = { follow: 0, like: 0, comment: 0, share: 0, gift: 0 };
  }
}
