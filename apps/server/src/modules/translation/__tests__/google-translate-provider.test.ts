import { describe, expect, it } from "vitest";
import { GoogleTranslateProvider } from "../google-translate-provider.js";

describe("GoogleTranslateProvider", () => {
  it("dịch thật 'hello' sang tiếng Việt, tự nhận diện ngôn ngữ nguồn (chỉ chạy nếu có GOOGLE_TRANSLATE_API_KEY)", async () => {
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!apiKey) {
      console.warn("SKIP: không có GOOGLE_TRANSLATE_API_KEY trong env — bỏ qua test gọi API thật.");
      return;
    }
    const provider = new GoogleTranslateProvider(apiKey);
    const result = await provider.translate("hello", "vi");
    expect(result.detectedSourceLang).toBe("en");
    expect(result.translatedText.length).toBeGreaterThan(0);
    // Không assert đúng 1 chuỗi cố định (bản dịch có thể đổi theo model) — chỉ cần có nội dung tiếng Việt hợp lý.
  });

  it("ném lỗi rõ ràng khi API key sai (401/403 thật từ Google, không giả lập)", async () => {
    const provider = new GoogleTranslateProvider("invalid-key-for-testing");
    await expect(provider.translate("hello", "vi")).rejects.toThrow(/GoogleTranslateProvider/);
  });
});
