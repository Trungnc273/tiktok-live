import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { ActionDispatcher, HandlerRegistry, MemoryExecutionLogPort } from "../../action-engine/index.js";
import { createSoundActionHandler } from "../sound-action-handler.js";

const soundsDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "sounds");

function giftEvent(): LiveEvent {
  return {
    schemaVersion: 1,
    id: "event-1",
    timestamp: new Date().toISOString(),
    streamId: "stream-1",
    type: "gift",
    user: { id: "u1", username: "gifter" },
    payload: { giftId: "1", giftName: "Rose", count: 1, isStreakEnd: true },
  } as LiveEvent;
}

describe("Sound action handler (qua ActionDispatcher)", () => {
  it("phát đúng file cấu hình -> onSoundReady nhận đúng đường dẫn", async () => {
    const readyPaths: string[] = [];
    const registry = new HandlerRegistry();
    registry.register(
      createSoundActionHandler({ soundsDir, onSoundReady: (p) => void readyPaths.push(p) }),
    );
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "sound", payload: { file: "rose.mp3" } }] },
      { ruleId: "r1", ruleName: "test", event: giftEvent() },
    );

    expect(outcomes[0].status).toBe("success");
    expect(readyPaths).toHaveLength(1);
    expect(readyPaths[0]).toContain("rose.mp3");
  });

  it("file không tồn tại -> action failed, không throw ra ngoài", async () => {
    const registry = new HandlerRegistry();
    registry.register(createSoundActionHandler({ soundsDir }));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "sound", payload: { file: "missing.mp3" } }] },
      { ruleId: "r1", ruleName: "test", event: giftEvent() },
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].error).toContain("Không tìm thấy");
  });

  it("định dạng không hỗ trợ -> action failed", async () => {
    const registry = new HandlerRegistry();
    registry.register(createSoundActionHandler({ soundsDir }));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "test", eventId: "event-1", actions: [{ type: "sound", payload: { file: "rose.ogg" } }] },
      { ruleId: "r1", ruleName: "test", event: giftEvent() },
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].error).toContain("không được hỗ trợ");
  });

  it("phát nhiều sound đồng thời có giới hạn maxConcurrent", async () => {
    let peakConcurrent = 0;
    let current = 0;
    const registry = new HandlerRegistry();
    registry.register(
      createSoundActionHandler({
        soundsDir,
        maxConcurrent: 2,
        onSoundReady: async () => {
          current += 1;
          peakConcurrent = Math.max(peakConcurrent, current);
          await new Promise((r) => setTimeout(r, 20));
          current -= 1;
        },
      }),
    );
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    // 5 event khác nhau (eventId khác để không bị idempotent-skip), cùng gọi song song.
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        dispatcher.dispatch(
          { ruleId: "r1", ruleName: "test", eventId: `event-${i}`, actions: [{ type: "sound", payload: { file: "rose.mp3" } }] },
          { ruleId: "r1", ruleName: "test", event: { ...giftEvent(), id: `event-${i}` } },
        ),
      ),
    );

    expect(peakConcurrent).toBeLessThanOrEqual(2);
  });
});
