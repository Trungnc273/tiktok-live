import type { TranslateResult, TranslationProvider } from "./provider.js";

/**
 * MyMemory Translated.net — miễn phí, KHÔNG cần API key/thẻ thanh toán (đổi từ
 * Google Cloud Translation vì người dùng không dùng được thẻ — xem thảo luận
 * thực tế: server LibreTranslate công cộng thử qua đều "chết"/không ổn định,
 * MyMemory verify thật hoạt động tốt, hỗ trợ tự nhận diện ngôn ngữ nguồn qua
 * `langpair=autodetect|<target>`).
 *
 * Giới hạn: ~5.000 từ/ngày ẩn danh theo IP, ~10.000 từ/ngày nếu kèm `de=email`
 * (không cần đăng ký, chỉ cần khai báo email liên hệ — chính sách của MyMemory).
 * https://mymemory.translated.net/doc/spec.php
 */
export class MyMemoryTranslateProvider implements TranslationProvider {
  constructor(private readonly contactEmail?: string) {}

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateResult> {
    const params = new URLSearchParams({
      q: text,
      langpair: `${sourceLang ?? "autodetect"}|${targetLang}`,
    });
    if (this.contactEmail) params.set("de", this.contactEmail);

    const res = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`MyMemoryTranslateProvider: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      responseStatus: number | string;
      responseData?: { translatedText?: string; detectedLanguage?: string };
    };
    // responseStatus có lúc là number (200) có lúc là string ("403") tuỳ lỗi — so sánh lỏng.
    if (String(data.responseStatus) !== "200" || !data.responseData?.translatedText) {
      throw new Error(`MyMemoryTranslateProvider: dịch thất bại (status ${data.responseStatus})`);
    }

    return {
      translatedText: data.responseData.translatedText,
      detectedSourceLang: data.responseData.detectedLanguage ?? sourceLang ?? "unknown",
    };
  }
}
