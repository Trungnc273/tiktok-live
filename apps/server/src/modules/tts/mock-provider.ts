import { writeFile } from "node:fs/promises";
import type { TTSProvider, TTSSynthesizeOptions } from "./provider.js";

/** WAV hợp lệ tối thiểu (44 byte header, PCM, 0 sample) — đủ để test kiểm tra file tồn tại/định dạng. */
function buildSilentWavHeader(): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(16000, 24); // sample rate
  header.writeUInt32LE(32000, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(0, 40);
  return header;
}

export interface MockProviderCall {
  text: string;
  outFilePath: string;
  lang?: string;
}

/**
 * Provider giả lập — không spawn process thật, ghi file WAV rỗng hợp lệ tức thì.
 * Dùng cho test tự động (không phụ thuộc Windows/PowerShell có sẵn hay không).
 */
export class MockTTSProvider implements TTSProvider {
  public readonly calls: MockProviderCall[] = [];
  public failNext = false;
  public alwaysFail = false;

  async synthesizeToFile(text: string, outFilePath: string, options?: TTSSynthesizeOptions): Promise<void> {
    this.calls.push({ text, outFilePath, lang: options?.lang });
    if (this.alwaysFail) {
      throw new Error("MockTTSProvider: giả lập lỗi provider (alwaysFail)");
    }
    if (this.failNext) {
      this.failNext = false;
      throw new Error("MockTTSProvider: giả lập lỗi provider");
    }
    await writeFile(outFilePath, buildSilentWavHeader());
  }
}
