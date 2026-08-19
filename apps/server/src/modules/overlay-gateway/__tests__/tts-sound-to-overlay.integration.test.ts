import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { LiveEvent, OverlayMessage } from "@tiktok-live/shared-types";
import { createHttpServer } from "../../api/index.js";
import { OverlayGateway } from "../gateway.js";
import { TokenStore } from "../token-store.js";
import { ActionDispatcher, HandlerRegistry, MemoryExecutionLogPort } from "../../action-engine/index.js";
import { createTTSActionHandler } from "../../tts/tts-action-handler.js";
import { MockTTSProvider } from "../../tts/mock-provider.js";
import { TTSQueue } from "../../tts/tts-queue.js";
import { createSoundActionHandler } from "../../audio/sound-action-handler.js";

const soundsDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "audio",
  "__tests__",
  "fixtures",
  "sounds",
);

/**
 * Kiểm chứng đầu-cuối chuỗi M09: TTS/Sound ActionHandler (M06/M07) -> broadcast
 * qua OverlayGateway thật (M08/M09) -> client Socket.IO thật nhận URL -> fetch
 * URL đó qua HTTP thật, xác nhận file audio thật được phục vụ (không phải 404).
 */
const OWNER_ID = "owner-1";

describe("M09: TTS/Sound -> OverlayGateway -> HTTP media (đầu-cuối thật)", () => {
  let httpApp: Awaited<ReturnType<typeof createHttpServer>>;
  let gateway: OverlayGateway;
  let tokenStore: TokenStore;
  let publicBaseUrl: string;
  let mediaDir: string;
  let client: ClientSocket;

  beforeAll(async () => {
    mediaDir = await mkdtemp(join(tmpdir(), "tiktok-live-media-"));
    tokenStore = new TokenStore();
    httpApp = await createHttpServer({
      tokenStore,
      publicBaseUrl: "http://placeholder",
      mediaDir,
      soundsDir,
      jwtSecret: "test-secret",
    });
    await httpApp.listen({ port: 0, host: "127.0.0.1" });
    const port = (httpApp.server.address() as AddressInfo).port;
    publicBaseUrl = `http://127.0.0.1:${port}`;

    gateway = new OverlayGateway(httpApp.server, tokenStore, () => null);

    const token = tokenStore.issue(OWNER_ID);
    client = ioClient(`${publicBaseUrl}/overlay`, { path: "/socket.io", query: { token } });
    await new Promise<void>((resolve) => client.on("connect", () => resolve()));
  });

  afterAll(async () => {
    client.close();
    await gateway.close();
    await httpApp.close();
  });

  it("TTS handler -> broadcast ttsReady -> client nhận URL -> URL trả về audio thật", async () => {
    const provider = new MockTTSProvider();
    const registry = new HandlerRegistry();
    registry.register(
      createTTSActionHandler(provider, new TTSQueue(), {
        outputDir: mediaDir,
        onAudioReady: (filePath) => {
          gateway.broadcast(OWNER_ID, "ttsReady", { url: `${publicBaseUrl}/media/${basename(filePath)}` });
        },
      }),
    );
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const received = new Promise<OverlayMessage>((resolve) => client.once("message", resolve));

    await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "t", eventId: "e-tts-1", actions: [{ type: "tts", payload: { template: "Cảm ơn {username}!" } }] },
      { ruleId: "r1", ruleName: "t", ownerId: "owner-1", event: followEvent() },
    );

    const message = await received;
    expect(message.type).toBe("ttsReady");
    const { url } = message.data as { url: string };

    const res = await fetch(url);
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    // MockTTSProvider ghi WAV silence hợp lệ đúng 44 byte (chỉ header, 0 sample) — xác nhận
    // đủ 44 byte header thật được phục vụ qua HTTP (không phải 404/rỗng).
    expect(buf.byteLength).toBe(44);
  });

  it("Sound handler -> broadcast soundReady -> client nhận URL -> URL trả về file sound thật", async () => {
    const registry = new HandlerRegistry();
    registry.register(
      createSoundActionHandler({
        soundsDir,
        onSoundReady: (filePath) => {
          gateway.broadcast(OWNER_ID, "soundReady", { url: `${publicBaseUrl}/sounds/${basename(filePath)}` });
        },
      }),
    );
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const received = new Promise<OverlayMessage>((resolve) => client.once("message", resolve));

    await dispatcher.dispatch(
      { ruleId: "r2", ruleName: "t", eventId: "e-sound-1", actions: [{ type: "sound", payload: { file: "rose.mp3" } }] },
      { ruleId: "r2", ruleName: "t", ownerId: "owner-1", event: followEvent() },
    );

    const message = await received;
    expect(message.type).toBe("soundReady");
    const { url } = message.data as { url: string };

    const res = await fetch(url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("fake-mp3-fixture");
  });
});

function followEvent(): LiveEvent {
  return {
    schemaVersion: 1,
    id: "event-1",
    timestamp: new Date().toISOString(),
    streamId: "stream-1",
    type: "follow",
    user: { id: "u1", username: "test_follower" },
    payload: {},
  } as LiveEvent;
}
