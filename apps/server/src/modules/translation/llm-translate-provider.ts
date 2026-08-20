import type { TranslateResult, TranslationProvider } from "./provider.js";

/**
 * Dịch bằng LLM qua API tương thích OpenAI Chat Completions (yêu cầu người dùng:
 * "phần dịch có vẻ phát hiện ngôn ngữ sai, thử dùng llm đi" — MyMemory là dịch vụ
 * crowd-sourced, dễ nhận sai ngôn ngữ với câu ngắn/tiếng lóng TikTok; LLM hiểu ngữ
 * cảnh tốt hơn nhiều cho cả nhận diện ngôn ngữ lẫn dịch).
 *
 * Bắt LLM trả về JSON có cấu trúc (`response_format: json_object`) thay vì tự
 * parse văn bản tự do — tránh lỗi vặt khi model thêm giải thích ngoài ý muốn.
 */
export class LLMTranslateProvider implements TranslationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateResult> {
    const systemPrompt = [
      "You are a translation engine embedded in a live-streaming app.",
      "You will be given a short chat message (often slang, emoji, or informal TikTok-style text).",
      sourceLang
        ? `The source language is "${sourceLang}".`
        : "Detect the source language automatically (ISO 639-1 code, e.g. vi, en, ko, ja, zh, th, fr, es).",
      `Translate the message to language code "${targetLang}".`,
      "Respond with ONLY a JSON object, no markdown, no explanation, matching exactly:",
      '{"translatedText": "...", "detectedSourceLang": "xx"}',
    ].join(" ");

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLMTranslateProvider: HTTP ${res.status} — ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLMTranslateProvider: phản hồi không có nội dung");
    }

    let parsed: { translatedText?: string; detectedSourceLang?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`LLMTranslateProvider: phản hồi không phải JSON hợp lệ: ${content.slice(0, 200)}`);
    }
    if (!parsed.translatedText) {
      throw new Error("LLMTranslateProvider: thiếu translatedText trong phản hồi");
    }

    return {
      translatedText: parsed.translatedText,
      detectedSourceLang: parsed.detectedSourceLang ?? sourceLang ?? "unknown",
    };
  }
}
