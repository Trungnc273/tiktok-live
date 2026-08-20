import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FptTTSProvider } from "../fpt-tts-provider.js";

describe("FptTTSProvider (API thật, chỉ chạy nếu có FPT_TTS_API_KEY)", () => {
  it("sinh file audio thật với nội dung tiếng Việt", async () => {
    const apiKey = process.env.FPT_TTS_API_KEY;
    if (!apiKey) {
      console.warn("SKIP: không có FPT_TTS_API_KEY trong env.");
      return;
    }
    const provider = new FptTTSProvider(apiKey, "banmai");
    const outPath = join(tmpdir(), `test-fpt-${randomUUID()}.mp3`);
    await provider.synthesizeToFile("Cảm ơn bạn đã theo dõi live hôm nay", outPath);

    const stats = await stat(outPath);
    expect(stats.size).toBeGreaterThan(1000);

    await unlink(outPath);
  }, 30_000);
});
