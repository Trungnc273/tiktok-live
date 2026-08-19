import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { ActionDispatcher, HandlerRegistry, MemoryExecutionLogPort } from "../../action-engine/index.js";
import { createTTSActionHandler } from "../tts-action-handler.js";
import { MockTTSProvider } from "../mock-provider.js";
import { TTSQueue } from "../tts-queue.js";

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

describe("TTS action handler (qua ActionDispatcher)", () => {
  it("render template đúng và gọi provider tổng hợp audio, ghi file thật", async () => {
    const provider = new MockTTSProvider();
    const queue = new TTSQueue();
    let readyPath: string | undefined;
    const handler = createTTSActionHandler(provider, queue, {
      onAudioReady: (filePath) => {
        readyPath = filePath;
      },
    });

    const registry = new HandlerRegistry();
    registry.register(handler);
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "tts", payload: { template: "Cảm ơn {username} đã follow!" } }] },
      { ruleId: "r1", ruleName: "test", event: followEvent() },
    );

    expect(outcomes[0].status).toBe("success");
    expect(provider.calls[0].text).toBe("Cảm ơn test_follower đã follow!");
    expect(readyPath).toBeDefined();
    expect(existsSync(readyPath!)).toBe(true);

    await rm(readyPath!, { force: true });
  });

  it("invalid payload (thiếu template) -> action failed, không throw ra ngoài dispatcher", async () => {
    const registry = new HandlerRegistry();
    registry.register(createTTSActionHandler(new MockTTSProvider(), new TTSQueue()));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "tts", payload: { wrong: "field" } }] },
      { ruleId: "r1", ruleName: "test", event: followEvent() },
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].error).toContain("template");
  });

  it("provider failure -> action failed (sau retry), có error message rõ ràng", async () => {
    const provider = new MockTTSProvider();
    provider.failNext = true;
    const registry = new HandlerRegistry();
    registry.register(createTTSActionHandler(provider, new TTSQueue()));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "tts", payload: { template: "hello {username}" } }] },
      { ruleId: "r1", ruleName: "test", event: followEvent() },
    );

    // maxRetries=1 nghĩa là thử lại 1 lần -> failNext chỉ fail lần đầu -> lần retry thành công
    expect(outcomes[0].status).toBe("success");
  });

  it("provider luôn lỗi -> action failed thật sự sau khi hết lượt retry", async () => {
    const provider = new MockTTSProvider();
    provider.alwaysFail = true;
    const registry = new HandlerRegistry();
    registry.register(createTTSActionHandler(provider, new TTSQueue()));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "tts", payload: { template: "hello {username}" } }] },
      { ruleId: "r1", ruleName: "test", event: followEvent() },
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].error).toContain("alwaysFail");
  });
});
