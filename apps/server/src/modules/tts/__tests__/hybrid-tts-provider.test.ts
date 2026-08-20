import { describe, expect, it } from "vitest";
import { HybridTTSProvider } from "../hybrid-tts-provider.js";
import { MockTTSProvider } from "../mock-provider.js";

describe("HybridTTSProvider", () => {
  it("dùng provider chính khi lang khớp primaryLang (mặc định vi, hoặc không truyền lang)", async () => {
    const primary = new MockTTSProvider();
    const fallback = new MockTTSProvider();
    const provider = new HybridTTSProvider(primary, fallback);

    await provider.synthesizeToFile("xin chào", "out1.wav", { lang: "vi" });
    await provider.synthesizeToFile("xin chào 2", "out2.wav");

    expect(primary.calls).toHaveLength(2);
    expect(fallback.calls).toHaveLength(0);
  });

  it("dùng provider dự phòng khi lang khác primaryLang (vd trả lời bình luận tiếng Anh/Hàn)", async () => {
    const primary = new MockTTSProvider();
    const fallback = new MockTTSProvider();
    const provider = new HybridTTSProvider(primary, fallback);

    await provider.synthesizeToFile("hello", "out.wav", { lang: "en" });

    expect(primary.calls).toHaveLength(0);
    expect(fallback.calls).toHaveLength(1);
    expect(fallback.calls[0].lang).toBe("en");
  });
});
