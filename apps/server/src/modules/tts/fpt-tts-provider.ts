import { writeFile } from "node:fs/promises";
import type { TTSProvider, TTSSynthesizeOptions } from "./provider.js";

/**
 * FPT.AI Text-to-Speech (https://fpt.ai/hmi/tts) — dịch vụ Việt Nam, giọng tiếng
 * Việt tự nhiên (yêu cầu người dùng: "muốn tiếng Việt... không dùng giống giọng
 * ở phần auto à?" — SAPI/espeak-ng đều không đáp ứng được, Piper không chạy được
 * trên VPS này). API trả về link "async" — audio được tổng hợp trong vài giây,
 * cần poll cho tới khi file thật sẵn sàng rồi tải về.
 *
 * CHỈ hỗ trợ tiếng Việt (các giọng FPT đều là giọng Việt) — dùng chung với
 * HybridTTSProvider để các ngôn ngữ khác (trả lời bình luận nước ngoài) vẫn có
 * provider dự phòng, không lỗi.
 */
export class FptTTSProvider implements TTSProvider {
  constructor(
    private readonly apiKey: string,
    private readonly voice: string = "banmai",
  ) {}

  async synthesizeToFile(text: string, outFilePath: string, _options?: TTSSynthesizeOptions): Promise<void> {
    const res = await fetch("https://api.fpt.ai/hmi/tts/v5", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        voice: this.voice,
        "content-type": "text/plain; charset=utf-8",
      },
      body: text,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`FptTTSProvider: HTTP ${res.status} — ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { error?: number; async?: string; message?: string };
    if (data.error !== 0 || !data.async) {
      throw new Error(`FptTTSProvider: yêu cầu thất bại — ${data.message ?? "không rõ lỗi"}`);
    }

    const bytes = await this.pollForAudio(data.async);
    await writeFile(outFilePath, bytes);
  }

  /** File audio được FPT tổng hợp bất đồng bộ (thường sẵn sàng sau 1-5 giây) — thử lại tới khi tải được. */
  private async pollForAudio(url: string, maxAttempts = 12, delayMs = 1000): Promise<Buffer> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const res = await fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) return buf;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error("FptTTSProvider: audio chưa sẵn sàng sau nhiều lần thử lại");
  }
}
