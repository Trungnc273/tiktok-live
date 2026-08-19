import type { LiveEvent } from "@tiktok-live/shared-types";

export interface AlertContent {
  title: string;
  subtitle?: string;
  className: string;
}

/**
 * Chuyển 1 LiveEvent thành nội dung hiển thị overlay (docs/promp/PHASE_10.md:
 * "Overlay must support: follow alert, gift alert, comment alert, custom text").
 * Hàm thuần (không phụ thuộc DOM/socket) — dễ test độc lập ("component test").
 */
export function describeAlert(event: LiveEvent): AlertContent | null {
  switch (event.type) {
    case "follow":
      return { title: `${event.user.username} vừa follow!`, className: "alert alert-follow" };
    case "gift":
      return {
        title: `${event.user.username} tặng ${event.payload.giftName} x${event.payload.count}!`,
        subtitle: event.payload.diamondValue ? `${event.payload.diamondValue} diamond` : undefined,
        className: "alert alert-gift",
      };
    case "comment":
      return {
        title: event.user.username,
        subtitle: event.payload.text,
        className: "alert alert-comment",
      };
    case "share":
      return { title: `${event.user.username} vừa share!`, className: "alert alert-share" };
    case "join":
    case "like":
    case "unknown":
      // Không hiện alert riêng cho like/join/unknown ở MVP — quá nhiều, gây spam màn hình.
      return null;
    default:
      return null;
  }
}
