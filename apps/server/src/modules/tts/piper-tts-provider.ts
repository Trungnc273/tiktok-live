import { spawn } from "node:child_process";
import type { TTSProvider, TTSSynthesizeOptions } from "./provider.js";

/**
 * Piper TTS (https://github.com/rhasspy/piper) — mô hình neural nhỏ gọn, chạy
 * nhanh trên CPU (không cần GPU), chất lượng tự nhiên hơn hẳn espeak-ng (yêu
 * cầu người dùng: "vừa nhanh lại phải đảm bảo nói ngôn ngữ chuẩn"). Chỉ hỗ trợ
 * 1 giọng cố định mỗi model .onnx — cấu hình đường dẫn model theo từng ngôn ngữ
 * qua `modelPaths`; ngôn ngữ chưa có model -> lỗi rõ ràng (không fallback ngầm
 * sang giọng sai ngôn ngữ).
 *
 * AN TOÀN INJECTION: giống các provider khác — text đưa qua STDIN của piper.exe
 * (không nội suy vào command line), đường dẫn output do code sinh (UUID).
 */
export interface PiperTTSProviderOptions {
  /** Đường dẫn piper.exe/piper (Linux binary cùng tên). */
  binaryPath: string;
  /** Map mã ngôn ngữ (TTS_LANGUAGES) -> đường dẫn file .onnx tương ứng. */
  modelPaths: Record<string, string>;
  /** Ngôn ngữ dùng khi không truyền lang hoặc không khớp map — mặc định "vi". */
  defaultLang?: string;
}

export class PiperTTSProvider implements TTSProvider {
  constructor(private readonly options: PiperTTSProviderOptions) {}

  async synthesizeToFile(text: string, outFilePath: string, ttsOptions?: TTSSynthesizeOptions): Promise<void> {
    const lang = ttsOptions?.lang ?? this.options.defaultLang ?? "vi";
    const modelPath = this.options.modelPaths[lang];
    if (!modelPath) {
      throw new Error(`PiperTTSProvider: chưa cấu hình model .onnx cho ngôn ngữ "${lang}"`);
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.options.binaryPath, ["--model", modelPath, "--output_file", outFilePath]);

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        reject(new Error(`PiperTTSProvider: không chạy được piper (${this.options.binaryPath}): ${err.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`PiperTTSProvider: piper thoát với code ${code}: ${stderr}`));
      });

      child.stdin.write(text, "utf8");
      child.stdin.end();
    });
  }
}
