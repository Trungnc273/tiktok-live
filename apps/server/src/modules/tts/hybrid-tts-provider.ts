import type { TTSProvider, TTSSynthesizeOptions } from "./provider.js";

/**
 * Kết hợp 2 provider theo ngôn ngữ — dùng khi 1 provider chỉ giỏi/chỉ hỗ trợ 1
 * ngôn ngữ (vd FptTTSProvider chỉ có giọng tiếng Việt) nhưng hệ thống vẫn cần đọc
 * được các ngôn ngữ khác (tính năng trả lời bình luận nước ngoài — xem
 * /api/live-comment/reply). `primaryLang` dùng `primary`, còn lại dùng `fallback`.
 */
export class HybridTTSProvider implements TTSProvider {
  constructor(
    private readonly primary: TTSProvider,
    private readonly fallback: TTSProvider,
    private readonly primaryLang = "vi",
  ) {}

  async synthesizeToFile(text: string, outFilePath: string, options?: TTSSynthesizeOptions): Promise<void> {
    const lang = options?.lang ?? this.primaryLang;
    const provider = lang === this.primaryLang ? this.primary : this.fallback;
    return provider.synthesizeToFile(text, outFilePath, options);
  }
}
