import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TTSProvider } from "./provider.js";

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
  async synthesizeToFile(text: string, outFilePath: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "tiktok-live-tts-"));
    const textFilePath = join(dir, `${randomUUID()}.txt`);

    try {
      await writeFile(textFilePath, text, "utf8");

      const script = [
        "Add-Type -AssemblyName System.Speech",
        `$text = [IO.File]::ReadAllText('${textFilePath}', [Text.Encoding]::UTF8)`,
        "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
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
