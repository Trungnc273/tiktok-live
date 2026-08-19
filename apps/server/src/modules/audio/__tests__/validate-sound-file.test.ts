import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateSoundFile } from "../validate-sound-file.js";

const soundsDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "sounds");

describe("validateSoundFile", () => {
  it("chấp nhận file mp3 tồn tại trong soundsDir", async () => {
    const result = await validateSoundFile("rose.mp3", soundsDir);
    expect(result.valid).toBe(true);
    expect(result.absolutePath).toContain("rose.mp3");
  });

  it("từ chối file không tồn tại", async () => {
    const result = await validateSoundFile("khong-ton-tai.mp3", soundsDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Không tìm thấy");
  });

  it("từ chối định dạng không hỗ trợ", async () => {
    const result = await validateSoundFile("rose.ogg", soundsDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("không được hỗ trợ");
  });

  it("chặn path traversal ra ngoài soundsDir", async () => {
    const result = await validateSoundFile("../../../windows/win.mp3", soundsDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("ngoài thư mục");
  });
});
