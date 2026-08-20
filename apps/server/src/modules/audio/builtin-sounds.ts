import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Sound hiệu ứng dựng sẵn (yêu cầu người dùng: "tự thêm 1 số sound sẵn hệ thống
 * cho nghe trước"). Không tải file có sẵn quyền tác giả từ đâu — TỰ TỔNG HỢP bằng
 * sóng sine/square (giống nhạc chuông điện thoại đời cũ), sinh file WAV thật lúc
 * khởi động, không phụ thuộc internet, không vướng bản quyền.
 */
interface Tone {
  freq: number;
  durationMs: number;
  type?: "sine" | "square";
}

const SAMPLE_RATE = 22050;
const AMPLITUDE = 0.3; // <1 để tránh clipping khi ghép nhiều tone liền nhau

function synthWav(tones: Tone[]): Buffer {
  const totalSamples = tones.reduce((sum, t) => sum + Math.round((t.durationMs / 1000) * SAMPLE_RATE), 0);
  const pcm = new Int16Array(totalSamples);
  let offset = 0;

  for (const tone of tones) {
    const n = Math.round((tone.durationMs / 1000) * SAMPLE_RATE);
    const fadeSamples = Math.max(1, Math.min(200, Math.floor(n / 8))); // fade in/out chống tiếng "tách" ở đầu/cuối
    for (let i = 0; i < n; i += 1) {
      const t = i / SAMPLE_RATE;
      const raw =
        tone.type === "square"
          ? Math.sign(Math.sin(2 * Math.PI * tone.freq * t)) || 1
          : Math.sin(2 * Math.PI * tone.freq * t);
      let envelope = 1;
      if (i < fadeSamples) envelope = i / fadeSamples;
      else if (i > n - fadeSamples) envelope = (n - i) / fadeSamples;
      pcm[offset + i] = Math.round(raw * envelope * AMPLITUDE * 32767);
    }
    offset += n;
  }
  return pcmToWav(pcm);
}

function pcmToWav(pcm: Int16Array): Buffer {
  const dataSize = pcm.length * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}

export interface BuiltinSound {
  file: string;
  label: string;
}

/** Tên hiển thị cho dashboard — file thật nằm ở `${soundsDir}/builtin/`. */
export const BUILTIN_SOUNDS: BuiltinSound[] = [
  { file: "builtin/ting.wav", label: "🔔 Ting (thông báo ngắn)" },
  { file: "builtin/pop.wav", label: "🫧 Pop (tách nhẹ)" },
  { file: "builtin/coin.wav", label: "🪙 Coin (2 nốt)" },
  { file: "builtin/chime.wav", label: "🎐 Chime (3 nốt)" },
  { file: "builtin/success.wav", label: "✅ Success (fanfare ngắn)" },
  { file: "builtin/alert.wav", label: "🚨 Alert (báo động)" },
];

const GENERATORS: Record<string, () => Buffer> = {
  "ting.wav": () => synthWav([{ freq: 1600, durationMs: 180 }]),
  "pop.wav": () => synthWav([{ freq: 300, durationMs: 60, type: "square" }]),
  "coin.wav": () =>
    synthWav([
      { freq: 988, durationMs: 90 },
      { freq: 1319, durationMs: 140 },
    ]),
  "chime.wav": () =>
    synthWav([
      { freq: 784, durationMs: 120 },
      { freq: 988, durationMs: 120 },
      { freq: 1319, durationMs: 220 },
    ]),
  "success.wav": () =>
    synthWav([
      { freq: 523, durationMs: 100 },
      { freq: 659, durationMs: 100 },
      { freq: 784, durationMs: 100 },
      { freq: 1047, durationMs: 240 },
    ]),
  "alert.wav": () =>
    synthWav([
      { freq: 900, durationMs: 120 },
      { freq: 600, durationMs: 120 },
      { freq: 900, durationMs: 120 },
      { freq: 600, durationMs: 120 },
    ]),
};

/**
 * Sinh sẵn các file sound hệ thống vào `${soundsDir}/builtin/` nếu CHƯA có (idempotent
 * — không ghi đè, chạy mỗi lần khởi động server không tốn gì đáng kể). Gọi 1 lần lúc
 * `main()` khởi động, trước khi mở cổng lắng nghe.
 */
export async function ensureBuiltinSounds(soundsDir: string): Promise<void> {
  const dir = join(soundsDir, "builtin");
  await mkdir(dir, { recursive: true });

  for (const [filename, generate] of Object.entries(GENERATORS)) {
    const path = join(dir, filename);
    const exists = await access(path)
      .then(() => true)
      .catch(() => false);
    if (exists) continue;
    await writeFile(path, generate());
  }
}
