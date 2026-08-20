import { describe, expect, it } from "vitest";
import { MyMemoryTranslateProvider } from "../mymemory-translate-provider.js";

describe("MyMemoryTranslateProvider (API thật, miễn phí, không cần key)", () => {
  it("dịch thật 'hello' sang tiếng Việt, tự nhận diện ngôn ngữ nguồn", async () => {
    const provider = new MyMemoryTranslateProvider();
    const result = await provider.translate("hello", "vi");
    expect(result.detectedSourceLang.toLowerCase()).toMatch(/^en/);
    expect(result.translatedText.length).toBeGreaterThan(0);
  });

  it("dịch tiếng Hàn -> tiếng Việt, tự nhận diện đúng nguồn 'ko'", async () => {
    const provider = new MyMemoryTranslateProvider();
    const result = await provider.translate("안녕하세요", "vi");
    expect(result.detectedSourceLang.toLowerCase()).toBe("ko");
    expect(result.translatedText).toContain("Xin ch");
  });

  it("dịch với source cố định (không auto-detect) — cho chiều trả lời tiếng Việt -> ngôn ngữ khác", async () => {
    // MyMemory là dịch vụ crowd-sourced miễn phí — không assert đúng 1 chuỗi cố
    // định (chất lượng/kết quả có thể đổi), chỉ cần gọi thành công và có nội dung.
    const provider = new MyMemoryTranslateProvider();
    const result = await provider.translate("Cảm ơn bạn rất nhiều", "en", "vi");
    expect(result.translatedText.length).toBeGreaterThan(0);
  });
});
