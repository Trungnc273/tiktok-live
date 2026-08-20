import type { LiveEvent } from "@tiktok-live/shared-types";

/**
 * Biến sẵn có cho template, tuỳ theo LiveEvent.type.
 *
 * `username` = @handle TikTok thật (vd "nguyenvana123") — chính xác nhưng đọc lên
 * nghe cứng/khó nghe, đặc biệt với ID toàn số/ký tự lạ.
 * `nickname` = tên hiển thị (vd "Nguyễn Văn A") — tự nhiên hơn khi đọc bằng TTS,
 * fallback về `username` nếu TikTok không trả nickname (hiếm, một số event cũ).
 * Yêu cầu người dùng: mặc định nên dùng {nickname} trong template, không phải
 * {username} — {username} vẫn giữ lại cho ai cần nhắc chính xác handle.
 */
export function buildTemplateVariables(event: LiveEvent): Record<string, string> {
  const vars: Record<string, string> = {
    username: event.user.username,
    nickname: event.user.nickname ?? event.user.username,
  };

  switch (event.type) {
    case "comment":
      vars.comment = event.payload.text;
      break;
    case "gift":
      vars.giftName = event.payload.giftName;
      vars.count = String(event.payload.count);
      break;
    case "like":
      vars.count = String(event.payload.count);
      break;
    case "join":
      if (event.payload.viewerCount !== undefined) {
        vars.viewerCount = String(event.payload.viewerCount);
      }
      break;
    default:
      break;
  }

  return vars;
}
