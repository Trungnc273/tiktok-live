/**
 * Loại bỏ control character khỏi text thô (comment...) trước khi đưa vào LiveEvent.
 * Đây là bước sanitize "cơ bản" theo EVENT-MODEL.md — KHÔNG escape cho từng ngữ cảnh
 * hiển thị cụ thể (TTS, overlay HTML...); nơi tiêu thụ tự escape theo nhu cầu của nó.
 *
 * Regex dựng bằng mã hex (không phải regex literal) để tránh mọi rủi ro công cụ
 * chỉnh sửa văn bản ghi nhầm ký tự điều khiển thật vào source thay vì escape sequence.
 */
const CONTROL_CHARS = new RegExp("[\\x00-\\x1f\\x7f]", "g");

export function sanitizeText(input: string): string {
  return input.replace(CONTROL_CHARS, "").trim();
}
