import type { TranslateResult, TranslationProvider } from "./provider.js";

/** Provider giả lập cho test — không gọi mạng, trả về text nguyên văn kèm tiền tố rõ ràng. */
export class MockTranslationProvider implements TranslationProvider {
  public readonly calls: { text: string; targetLang: string; sourceLang?: string }[] = [];
  public failNext = false;

  async translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateResult> {
    this.calls.push({ text, targetLang, sourceLang });
    if (this.failNext) {
      this.failNext = false;
      throw new Error("MockTranslationProvider: giả lập lỗi provider");
    }
    return { translatedText: `[${targetLang}] ${text}`, detectedSourceLang: sourceLang ?? "en" };
  }
}
