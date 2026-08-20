import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TTSProvider, TTSSynthesizeOptions } from "./provider.js";

/**
 * Provider thật dùng Windows Speech API (System.Speech) qua PowerShell.
 *
 * AN TOÀN INJECTION (SYSTEM-ARCHITECTURE.md — Security: "sanitize biến trong TTS
 * template... tránh injection vào lệnh hệ thống nếu TTS provider chạy local qua CLI"):
 * `text` KHÔNG BAO GIỜ được nội suy trực tiếp vào chuỗi lệnh PowerShell. Text được
 * ghi ra 1 file tạm trước, script PowerShell chỉ đọc nội dung từ file đó qua đường
 * dẫn do chính code này sinh ra (UUID, không phải input người dùng) — loại bỏ hoàn
 * toàn khả năng thoát khỏi ngữ cảnh lệnh dù `text` chứa ký tự đặc biệt bất kỳ.
 */
export class WindowsSapiProvider implements TTSProvider {
  async synthesizeToFile(text: string, outFilePath: string, options?: TTSSynthesizeOptions): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "tiktok-live-tts-"));
    const textFilePath = join(dir, `${randomUUID()}.txt`);
    // "lang" đi qua whitelist TTS_LANGUAGES (@tiktok-live/shared-types) ở tầng
    // trên, nhưng vẫn tự validate lại ở đây (defense-in-depth) trước khi nội suy
    // vào script PowerShell — chỉ chấp nhận đúng dạng mã ngôn ngữ 2 chữ cái.
    const cultureFilter = options?.lang && /^[a-z]{2}$/i.test(options.lang) ? options.lang.toLowerCase() : "vi";

    try {
      await writeFile(textFilePath, text, "utf8");

      const script = [
        "Add-Type -AssemblyName System.Speech",
        `$text = [IO.File]::ReadAllText('${textFilePath}', [Text.Encoding]::UTF8)`,
        "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        // Chọn giọng nữ phổ biến nhất trong các giọng SAPI đã cài trên máy: ưu
        // tiên giọng nữ đúng ngôn ngữ được chọn (nếu máy có cài gói ngôn ngữ đó),
        // nếu không có thì lấy giọng nữ bất kỳ (vd: "Microsoft Zira" có sẵn mặc
        // định trên hầu hết máy Windows) — không tìm được thì giữ giọng mặc định.
        "$voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Gender -eq 'Female' }",
        `$byLang = $voices | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq '${cultureFilter}' } | Select-Object -First 1`,
        "$chosen = if ($byLang) { $byLang } else { $voices | Select-Object -First 1 }",
        "if ($chosen) { $synth.SelectVoice($chosen.VoiceInfo.Name) }",
        `$synth.SetOutputToWaveFile('${outFilePath}')`,
        "$synth.Speak($text)",
        "$synth.Dispose()",
      ].join("; ");

      await this.runPowerShell(script);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private runPowerShell(script: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // args dạng mảng, KHÔNG dùng shell:true -> không đi qua shell interpolation.
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        windowsHide: true,
      });

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`WindowsSapiProvider: powershell thoát với code ${code}: ${stderr}`));
      });
    });
  }
}
