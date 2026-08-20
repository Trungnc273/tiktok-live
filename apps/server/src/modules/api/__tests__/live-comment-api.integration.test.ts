import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpServer } from "../http-server.js";
import { TokenStore, OverlayGateway } from "../../overlay-gateway/index.js";
import { MockTTSProvider } from "../../tts/index.js";
import { MyMemoryTranslateProvider } from "../../translation/index.js";

const JWT_SECRET = "test-secret";

let app: Awaited<ReturnType<typeof createHttpServer>>;
let mediaDir: string;
let baseUrl: string;
let authHeaders: { cookie: string };
let ttsProvider: MockTTSProvider;

beforeAll(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), "live-comment-api-test-"));
  ttsProvider = new MockTTSProvider();
  const overlayGatewayBox: { current: OverlayGateway | null } = { current: null };

  app = await createHttpServer({
    tokenStore: new TokenStore(),
    publicBaseUrl: "http://localhost:0",
    jwtSecret: JWT_SECRET,
    mediaDir,
    ttsProvider,
    translationProvider: new MyMemoryTranslateProvider(),
    overlayGatewayBox,
  });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
  overlayGatewayBox.current = new OverlayGateway(app.server, new TokenStore(), () => null);

  const token = await app.jwt.sign({ id: randomUUID(), email: "x@test.com", role: "user" });
  authHeaders = { cookie: `token=${token}` };
});

afterAll(async () => {
  await app.close();
  await rm(mediaDir, { recursive: true, force: true });
});

describe("Live comment translate/reply API (MyMemory thật + MockTTS)", () => {
  it("không đăng nhập -> 401 cho cả 2 route", async () => {
    const res1 = await fetch(`${baseUrl}/api/live-comment/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res1.status).toBe(401);

    const res2 = await fetch(`${baseUrl}/api/live-comment/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "xin chào", targetLang: "en" }),
    });
    expect(res2.status).toBe(401);
  });

  it("POST /api/live-comment/translate: dịch bình luận tiếng Anh sang tiếng Việt, tạo audio thật, phát hiện nguồn 'en'", async () => {
    const res = await fetch(`${baseUrl}/api/live-comment/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ text: "hello, great stream!", nickname: "John" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { translatedText: string; detectedSourceLang: string; url: string };
    expect(body.translatedText.length).toBeGreaterThan(0);
    expect(body.detectedSourceLang.toLowerCase()).toMatch(/^en/);
    expect(body.url).toContain("/media/comment-");
    // TTS thật (mock) đã được gọi với nội dung có tên người + bản dịch.
    expect(ttsProvider.calls.at(-1)?.text).toContain("John");
  });

  it("POST /api/live-comment/reply: dịch trả lời tiếng Việt sang tiếng Anh, đọc bằng đúng ngôn ngữ đích", async () => {
    const res = await fetch(`${baseUrl}/api/live-comment/reply`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ text: "Cảm ơn bạn đã theo dõi", targetLang: "en" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { translatedText: string; url: string };
    expect(body.translatedText.length).toBeGreaterThan(0);
    expect(body.url).toContain("/media/reply-");
    expect(ttsProvider.calls.at(-1)?.lang).toBe("en");
  });

  it("từ chối text rỗng (400)", async () => {
    const res = await fetch(`${baseUrl}/api/live-comment/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders },
      body: JSON.stringify({ text: "" }),
    });
    expect(res.status).toBe(400);
  });
});
