import { describe, expect, it } from "vitest";
import { LLMTranslateProvider } from "../llm-translate-provider.js";

describe("LLMTranslateProvider (API thật, chỉ chạy nếu có DEEPSEEK_API_KEY)", () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL;
  const model = process.env.DEEPSEEK_MODEL;

  it("dịch câu tiếng Anh ngắn/slang kiểu TikTok sang tiếng Việt, nhận diện đúng nguồn 'en'", async () => {
    if (!apiKey || !baseUrl || !model) {
      console.warn("SKIP: thiếu DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL/DEEPSEEK_MODEL trong env.");
      return;
    }
    const provider = new LLMTranslateProvider(apiKey, baseUrl, model);
    const result = await provider.translate("omg this stream is fire 🔥🔥", "vi");
    expect(result.detectedSourceLang.toLowerCase()).toMatch(/^en/);
    expect(result.translatedText.length).toBeGreaterThan(0);
  });

  it("dịch câu tiếng Việt sang tiếng Anh (chiều trả lời)", async () => {
    if (!apiKey || !baseUrl || !model) {
      console.warn("SKIP: thiếu env DeepSeek.");
      return;
    }
    const provider = new LLMTranslateProvider(apiKey, baseUrl, model);
    const result = await provider.translate("Cảm ơn bạn đã theo dõi live nhé", "en", "vi");
    expect(result.translatedText.toLowerCase()).toMatch(/thank|follow|watch/);
  });
});
