import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { AutomationRule, LiveEvent, OverlayMessage } from "@tiktok-live/shared-types";
import { ConnectionManager, MockProvider } from "../../modules/tiktok-adapter/index.js";
import { normalizeAndValidate } from "../../modules/event-normalizer/index.js";
import { evaluateRules } from "../../modules/rule-engine/index.js";
import { ActionDispatcher, HandlerRegistry, MemoryExecutionLogPort, type DispatchOutcome } from "../../modules/action-engine/index.js";
import { createTTSActionHandler, MockTTSProvider, TTSQueue } from "../../modules/tts/index.js";
import { createSoundActionHandler } from "../../modules/audio/index.js";
import { OverlayGateway, TokenStore } from "../../modules/overlay-gateway/index.js";

export const soundsFixtureDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "modules",
  "audio",
  "__tests__",
  "fixtures",
  "sounds",
);

/**
 * Lắp ráp lại đúng chuỗi pipeline của main.ts (M01→M11) nhưng KHÔNG qua Postgres
 * (rules truyền trực tiếp, không qua REST API/DB — CRUD/DB đã test riêng ở M03/M10)
 * để bộ E2E scenario (M12/PHASE_13.md) chạy nhanh, xác định, không cần Docker.
 *
 * MockTTSProvider được dùng thay Windows SAPI thật — provider thật đã được verify
 * riêng ở M06/M10 (audio thật, 141-240KB WAV). Ở đây mục tiêu là verify ĐÚNG LUỒNG
 * (event -> rule -> action -> overlay), không phải verify lại chất lượng audio.
 */
export interface TestPipeline {
  manager: ConnectionManager;
  provider: MockProvider;
  ttsProvider: MockTTSProvider;
  liveEvents: LiveEvent[];
  outcomes: Array<{ eventId: string; outcomes: DispatchOutcome[] }>;
  overlayMessages: OverlayMessage[];
  client: ClientSocket;
  registerHandler: HandlerRegistry["register"];
  cleanup: () => Promise<void>;
}

export async function createTestPipeline(rules: AutomationRule[]): Promise<TestPipeline> {
  const provider = new MockProvider();
  const manager = new ConnectionManager(provider, { baseReconnectDelayMs: 20, maxReconnectDelayMs: 100 });

  const httpServer: HttpServer = createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const tokenStore = new TokenStore();
  const gateway = new OverlayGateway(httpServer, tokenStore);

  const token = tokenStore.issue();
  const client = ioClient(`http://127.0.0.1:${port}/overlay`, { path: "/socket.io", query: { token } });
  await new Promise<void>((resolve) => client.on("connect", () => resolve()));

  const overlayMessages: OverlayMessage[] = [];
  client.on("message", (m: OverlayMessage) => overlayMessages.push(m));

  const ttsProvider = new MockTTSProvider();
  const registry = new HandlerRegistry();
  registry.register(
    createTTSActionHandler(ttsProvider, new TTSQueue(), {
      onAudioReady: (filePath) => void gateway.broadcast("ttsReady", { url: filePath }),
    }),
  );
  registry.register(
    createSoundActionHandler({
      soundsDir: soundsFixtureDir,
      onSoundReady: (filePath) => void gateway.broadcast("soundReady", { url: filePath }),
    }),
  );

  const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

  const liveEvents: LiveEvent[] = [];
  const outcomes: Array<{ eventId: string; outcomes: DispatchOutcome[] }> = [];

  manager.on("event", (rawEvent) => {
    const result = normalizeAndValidate(rawEvent, "test-stream");
    if (!result.ok) return;
    liveEvents.push(result.event);
    gateway.broadcast("liveEvent", result.event);

    const matches = evaluateRules(rules, result.event);
    for (const match of matches) {
      void dispatcher
        .dispatch(match, { ruleId: match.ruleId, ruleName: match.ruleName, event: result.event })
        .then((o) => outcomes.push({ eventId: result.event.id, outcomes: o }));
    }
  });

  await manager.connect("test-streamer");

  return {
    manager,
    provider,
    ttsProvider,
    liveEvents,
    outcomes,
    overlayMessages,
    client,
    registerHandler: registry.register.bind(registry),
    cleanup: async () => {
      client.close();
      await manager.stop();
      await gateway.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

export function waitFor(predicate: () => boolean, timeoutMs = 2000, intervalMs = 20): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
      setTimeout(check, intervalMs);
    };
    check();
  });
}
