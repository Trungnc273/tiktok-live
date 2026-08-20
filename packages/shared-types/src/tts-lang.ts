/**
 * Ngôn ngữ đọc TTS cho action `type: "tts"` — người dùng chọn ở AutomationBuilder,
 * server ánh xạ sang giọng thật của từng TTSProvider (xem windows-sapi-provider.ts /
 * linux-espeak-provider.ts). Danh sách hữu hạn (không cho nhập tự do) vì mỗi
 * provider chỉ hỗ trợ 1 tập giọng cố định — chọn tự do dễ ra input vô nghĩa.
 */
export const TTS_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "th", label: "ไทย" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
] as const;

export type TTSLanguageCode = (typeof TTS_LANGUAGES)[number]["code"];

export const DEFAULT_TTS_LANGUAGE: TTSLanguageCode = "vi";

export function isTTSLanguageCode(value: unknown): value is TTSLanguageCode {
  return typeof value === "string" && TTS_LANGUAGES.some((l) => l.code === value);
}
