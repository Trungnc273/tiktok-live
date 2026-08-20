/**
 * Provider abstraction (docs/promp/PHASE_9.md): không được gắn cứng Action Engine
 * vào 1 vendor TTS cụ thể.
 *
 *   TTSProvider
 *    ├── WindowsSapiProvider (thật — Windows System.Speech, không cần API key)
 *    └── MockProvider (test/CI)
 *
 * Ghi chú lựa chọn provider thật: MVP KHÔNG có API key của bất kỳ dịch vụ TTS trả
 * phí nào (Azure/ElevenLabs/Google...). Windows SAPI được chọn vì: miễn phí, có sẵn
 * trên máy dev (Windows), không cần đăng ký, đủ để verify pipeline hoạt động thật.
 * Đây là quyết định tạm thời cho MVP — dễ thay bằng provider khác sau vì đã có
 * abstraction, không ảnh hưởng Action Engine/Rule Engine.
 */
export interface TTSSynthesizeOptions {
  /** Mã ngôn ngữ (xem TTS_LANGUAGES ở @tiktok-live/shared-types) — không truyền = provider tự chọn mặc định (Tiếng Việt). */
  lang?: string;
}

export interface TTSProvider {
  /** Tổng hợp `text` thành audio, ghi ra file WAV tại `outFilePath`. */
  synthesizeToFile(text: string, outFilePath: string, options?: TTSSynthesizeOptions): Promise<void>;
}
