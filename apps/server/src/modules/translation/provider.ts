/**
 * Provider abstraction cho dịch thuật (giống TTSProvider ở modules/tts/provider.ts)
 * — yêu cầu người dùng: "ưu tiên opensrc để mình làm chủ nhưng giờ dùng tạm gg cho
 * MVP". GoogleTranslateProvider là bản đầu tiên; sau này thêm
 * LibreTranslateProvider (tự host) không cần đổi gì ở tầng gọi (routes, dashboard).
 */
export interface TranslateResult {
  translatedText: string;
  /** Mã ngôn ngữ nguồn (ISO 639-1, vd "en", "ko") — do provider tự nhận diện nếu không truyền `sourceLang`. */
  detectedSourceLang: string;
}

export interface TranslationProvider {
  translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslateResult>;
}
