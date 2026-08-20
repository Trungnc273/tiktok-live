import { describe, expect, it, afterAll } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_SOUNDS, ensureBuiltinSounds } from "../builtin-sounds.js";

describe("ensureBuiltinSounds", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function tmpSoundsDir() {
    const dir = await mkdtemp(join(tmpdir(), "builtin-sounds-test-"));
    dirs.push(dir);
    return dir;
  }

  it("sinh đủ file WAV thật cho mọi sound khai báo trong BUILTIN_SOUNDS, header hợp lệ", async () => {
    const soundsDir = await tmpSoundsDir();
    await ensureBuiltinSounds(soundsDir);

    for (const { file } of BUILTIN_SOUNDS) {
      const path = join(soundsDir, file); // file = "builtin/xxx.wav"
      const info = await stat(path);
      expect(info.size).toBeGreaterThan(44); // > header rỗng -> có dữ liệu âm thanh thật

      const buf = await readFile(path);
      expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
      const declaredDataSize = buf.readUInt32LE(40);
      expect(declaredDataSize).toBe(buf.length - 44); // header khai đúng số byte data thật
    }
  });

  it("idempotent — gọi lại lần 2 không ghi đè (nội dung file giữ nguyên)", async () => {
    const soundsDir = await tmpSoundsDir();
    await ensureBuiltinSounds(soundsDir);
    const path = join(soundsDir, "builtin/ting.wav");
    const before = await readFile(path);
    const beforeStat = await stat(path);

    await new Promise((r) => setTimeout(r, 20)); // đảm bảo mtime sẽ khác nếu bị ghi lại
    await ensureBuiltinSounds(soundsDir);

    const after = await readFile(path);
    const afterStat = await stat(path);
    expect(after.equals(before)).toBe(true);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });
});
