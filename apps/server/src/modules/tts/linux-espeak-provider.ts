import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TTSProvider, TTSSynthesizeOptions } from "./provider.js";

/**
 * Mã ngôn ngữ (@tiktok-live/shared-types TTS_LANGUAGES) -> voice espeak-ng.
 * Hậu tố "+f3" = biến thể giọng nữ (xem ghi chú ở LinuxEspeakProviderOptions).
 * "zh" dùng "cmn" vì espeak-ng đặt tên giọng Quan Thoại là "cmn", không phải "zh".
 */
const LANG_TO_ESPEAK_VOICE: Record<string, string> = {
  vi: "vi+f3",
  en: "en-us+f3",
  zh: "cmn+f3",
  ja: "ja+f3",
  ko: "ko+f3",
  th: "th+f3",
  fr: "fr+f3",
  es: "es+f3",
};

/**
 * Provider thật cho Linux dùng `espeak-ng` (miễn phí, mã nguồn mở, không cần API
 * key/internet — cùng triết lý với WindowsSapiProvider). Có giọng tiếng Việt sẵn
 * (Bắc/Trung/Nam — xem LinuxEspeakProviderOptions.voice), đã xác nhận THẬT bằng
 * cách chạy `espeak-ng` trong container Debian, sinh ra file WAV ~100KB cho 1 câu.
 *
 * Cài đặt trên VPS Linux: `apt-get install espeak-ng` (Debian/Ubuntu) hoặc tương
 * đương distro khác — KHÔNG đóng gói sẵn trong app, coi là dependency hệ thống.
 *
 * AN TOÀN INJECTION: giống WindowsSapiProvider — text KHÔNG BAO GIỜ nội suy trực
 * tiếp vào tham số dòng lệnh. Ghi ra file tạm trước, dùng `espeak-ng -f <file>` để
 * đọc nội dung từ file (đường dẫn do chính code sinh ra, không phải input người
 * dùng) — loại bỏ hoàn toàn khả năng command injection.
 */
export interface LinuxEspeakProviderOptions {
  /**
   * Giọng tiếng Việt: "vi" (Bắc, mặc định), "vi-vn-x-central" (Trung), "vi-vn-x-south" (Nam).
   * Hậu tố "+f3" là "voice variant" có sẵn trong espeak-ng, chỉnh formant để nghe
   * giống giọng nữ hơn (espeak-ng không có bộ giọng nữ thu âm riêng theo ngôn ngữ,
   * đây là cách phổ biến nhất được cộng đồng espeak-ng dùng để có giọng nữ).
   */
  voice?: string;
  /** Tốc độ đọc (từ/phút) — espeak-ng mặc định ~175, có thể chỉnh chậm hơn cho dễ nghe. */
  speed?: number;
}

export class LinuxEspeakProvider implements TTSProvider {
  private readonly voice: string;
  private readonly speed: number;

  constructor(options: LinuxEspeakProviderOptions = {}) {
    this.voice = options.voice ?? "vi+f3";
    this.speed = options.speed ?? 160;
  }

  async synthesizeToFile(text: string, outFilePath: string, options?: TTSSynthesizeOptions): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "tiktok-live-tts-"));
    const textFilePath = join(dir, `${randomUUID()}.txt`);
    // Ngôn ngữ do người dùng chọn cho action này (nếu có) ghi đè giọng mặc định
    // của instance; không nhận diện được -> giữ nguyên mặc định (Tiếng Việt).
    const voice = (options?.lang && LANG_TO_ESPEAK_VOICE[options.lang]) || this.voice;

    try {
      await writeFile(textFilePath, text, "utf8");
      await this.runEspeak(textFilePath, outFilePath, voice);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private runEspeak(textFilePath: string, outFilePath: string, voice: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // args dạng mảng, KHÔNG dùng shell:true -> không đi qua shell interpolation.
      const child = spawn("espeak-ng", [
        "-v",
        voice,
        "-s",
        String(this.speed),
        "-f",
        textFilePath,
        "-w",
        outFilePath,
      ]);

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        reject(
          new Error(
            `LinuxEspeakProvider: không chạy được espeak-ng (đã cài đặt chưa? "apt-get install espeak-ng"): ${err.message}`,
          ),
        );
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`LinuxEspeakProvider: espeak-ng thoát với code ${code}: ${stderr}`));
      });
    });
  }
}
