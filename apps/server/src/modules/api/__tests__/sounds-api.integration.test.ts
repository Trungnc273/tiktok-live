import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpServer } from "../http-server.js";
import { TokenStore } from "../../overlay-gateway/index.js";
import { ensureBuiltinSounds } from "../../audio/index.js";

const JWT_SECRET = "test-secret";

let app: Awaited<ReturnType<typeof createHttpServer>>;
let soundsDir: string;
let baseUrl: string;
let authHeaders: { cookie: string };

beforeAll(async () => {
  soundsDir = await mkdtemp(join(tmpdir(), "sounds-api-test-"));
  await ensureBuiltinSounds(soundsDir);

  app = await createHttpServer({
    tokenStore: new TokenStore(),
    publicBaseUrl: "http://localhost:0",
    jwtSecret: JWT_SECRET,
    soundsDir,
  });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;

  const token = await app.jwt.sign({ id: randomUUID(), email: "x@test.com", role: "user" });
  authHeaders = { cookie: `token=${token}` };
});

afterAll(async () => {
  await app.close();
  await rm(soundsDir, { recursive: true, force: true });
});

describe("Sounds API (thư viện sound + upload — Postgres không cần cho route này)", () => {
  it("không đăng nhập -> 401", async () => {
    const res = await fetch(`${baseUrl}/api/sounds`);
    expect(res.status).toBe(401);
  });

  it("GET /api/sounds trả về danh sách builtin (6 sound sinh sẵn) + uploaded rỗng lúc đầu", async () => {
    const res = await fetch(`${baseUrl}/api/sounds`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { builtin: { file: string; label: string }[]; uploaded: string[] };
    expect(body.builtin.length).toBe(6);
    expect(body.builtin[0]).toEqual(expect.objectContaining({ file: expect.stringMatching(/^builtin\//), label: expect.any(String) }));
    expect(body.uploaded).toEqual([]);
  });

  it("upload file .wav thật -> lưu vào soundsDir, GET /api/sounds thấy file mới, phát được qua /sounds/:file", async () => {
    // WAV hợp lệ tối thiểu (44 byte header PCM, 0 sample) — chỉ cần server chấp
    // nhận đúng định dạng, không cần đánh giá chất lượng âm thanh ở test API này.
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(0, 40);

    const form = new FormData();
    form.append("file", new Blob([header], { type: "audio/wav" }), "my recording.wav");

    const uploadRes = await fetch(`${baseUrl}/api/sounds/upload`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(uploadRes.status).toBe(200);
    const { file } = (await uploadRes.json()) as { file: string };
    expect(file).toMatch(/^upload-[0-9a-f-]+\.wav$/); // tên gốc "my recording.wav" bị thay bằng tên an toàn

    const listRes = await fetch(`${baseUrl}/api/sounds`, { headers: authHeaders });
    const listBody = (await listRes.json()) as { uploaded: string[] };
    expect(listBody.uploaded).toContain(file);

    const playRes = await fetch(`${baseUrl}/sounds/${file}`);
    expect(playRes.status).toBe(200);
    const bytes = await playRes.arrayBuffer();
    expect(bytes.byteLength).toBe(44);
  });

  it("từ chối định dạng không hỗ trợ (.exe)", async () => {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("not audio")], { type: "application/octet-stream" }), "virus.exe");

    const res = await fetch(`${baseUrl}/api/sounds/upload`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(res.status).toBe(400);
  });
});
