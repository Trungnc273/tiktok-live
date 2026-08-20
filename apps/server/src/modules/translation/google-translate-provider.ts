import type { TranslateResult, TranslationProvider } from "./provider.js";

/**
 * Google Cloud Translation API v2 (REST, xác thực bằng API key đơn giản — KHÔNG
 * cần OAuth/service account, phù hợp MVP tự host). Free tier ~500.000 ký
 * tự/tháng — xem docs/reports khi cần theo dõi quota thật.
 *
 * https://cloud.google.com/translate/docs/reference/rest/v2/translate
 */
export class GoogleTranslateProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateResult> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        ...(sourceLang ? { source: sourceLang } : {}),
        format: "text",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GoogleTranslateProvider: HTTP ${res.status} — ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
    };
    const translation = data.data?.translations?.[0];
    if (!translation) {
      throw new Error("GoogleTranslateProvider: phản hồi không có bản dịch");
    }

    return {
      translatedText: translation.translatedText,
      detectedSourceLang: translation.detectedSourceLanguage ?? sourceLang ?? "unknown",
    };
  }
}
