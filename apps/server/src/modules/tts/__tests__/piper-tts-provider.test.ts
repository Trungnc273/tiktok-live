import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PiperTTSProvider } from "../piper-tts-provider.js";

/**
 * Piper chỉ được cài trên VPS (chưa cài trên máy dev Windows này) — test thật
 * chỉ chạy khi có PIPER_BINARY_PATH + PIPER_VI_MODEL_PATH trong env (đặt khi
 * chạy trên VPS hoặc máy đã cài Piper), tự skip có lý do rõ ràng nếu không có.
 */
describe("PiperTTSProvider", () => {
  it("sinh file WAV thật với nội dung tiếng Việt (chỉ chạy nếu có PIPER_BINARY_PATH + PIPER_VI_MODEL_PATH)", async () => {
    const binaryPath = process.env.PIPER_BINARY_PATH;
    const modelPath = process.env.PIPER_VI_MODEL_PATH;
    if (!binaryPath || !modelPath) {
      console.warn("SKIP: thiếu PIPER_BINARY_PATH/PIPER_VI_MODEL_PATH trong env (bình thường trên máy chưa cài Piper).");
      return;
    }

    const provider = new PiperTTSProvider({ binaryPath, modelPaths: { vi: modelPath } });
    const outPath = join(tmpdir(), `test-piper-${randomUUID()}.wav`);
    await provider.synthesizeToFile("Cảm ơn bạn đã theo dõi kênh của tôi hôm nay", outPath, { lang: "vi" });

    const stats = await stat(outPath);
    expect(stats.size).toBeGreaterThan(1000);

    await unlink(outPath);
  });

  it("ném lỗi rõ ràng khi ngôn ngữ chưa có model cấu hình", async () => {
    const provider = new PiperTTSProvider({ binaryPath: "piper", modelPaths: { vi: "some.onnx" } });
    await expect(provider.synthesizeToFile("hello", "out.wav", { lang: "en" })).rejects.toThrow(
      /chưa cấu hình model/,
    );
  });
});
