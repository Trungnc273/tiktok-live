import { access } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative } from "node:path";

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".wav"]);

export interface SoundValidationResult {
  valid: boolean;
  error?: string;
  absolutePath?: string;
}

/**
 * Validate file sound cấu hình trong rule action `type: "sound"`.
 *
 * - Chỉ chấp nhận mp3/wav (docs/promp/PHASE_9.md: "other formats only if technically supported" -> MVP chỉ 2 định dạng này).
 * - Chặn path traversal ra ngoài `soundsDir` — dù `payload.file` do streamer tự cấu
 *   hình qua dashboard (không phải input trực tiếp từ khán giả TikTok), vẫn validate
 *   để tránh lỗi cấu hình vô tình trỏ ra ngoài thư mục cho phép.
 */
export async function validateSoundFile(file: string, soundsDir: string): Promise<SoundValidationResult> {
  const ext = extname(file).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Định dạng "${ext}" không được hỗ trợ (chỉ mp3, wav)` };
  }

  const absolutePath = isAbsolute(file) ? normalize(file) : normalize(join(soundsDir, file));
  const rel = relative(soundsDir, absolutePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { valid: false, error: "File nằm ngoài thư mục sounds cho phép" };
  }

  try {
    await access(absolutePath);
  } catch {
    return { valid: false, error: `Không tìm thấy file: ${absolutePath}` };
  }

  return { valid: true, absolutePath };
}
