import { afterEach, describe, expect, it } from "vitest";
import type { AutomationRule, ConditionNode, RuleAction } from "@tiktok-live/shared-types";
import { createTestPipeline, waitFor, type TestPipeline } from "./test-pipeline.js";

let ruleCounter = 0;
function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  ruleCounter += 1;
  return {
    id: `rule-${ruleCounter}`,
    name: `Rule ${ruleCounter}`,
    enabled: true,
    priority: 100,
    trigger: { eventType: "follow" },
    conditions: null,
    actions: [{ type: "tts", payload: { template: "hi {username}" } }],
    createdAt: new Date(2026, 0, ruleCounter).toISOString(),
    updatedAt: new Date(2026, 0, ruleCounter).toISOString(),
    ...overrides,
  };
}

let pipeline: TestPipeline | null = null;
afterEach(async () => {
  await pipeline?.cleanup();
  pipeline = null;
});

/**
 * 6 scenario bắt buộc theo docs/promp/PHASE_13.md — chạy trên pipeline lắp ráp
 * lại đúng chuỗi module thật (M01-M11), không phải mock toàn bộ.
 */
describe("E2E scenarios (PHASE_13.md)", () => {
  it("Scenario 1: Follow -> Rule -> TTS", async () => {
    const rules = [rule({ trigger: { eventType: "follow" }, actions: [{ type: "tts", payload: { template: "Cảm ơn {username} đã follow!" } }] })];
    pipeline = await createTestPipeline(rules);

    pipeline.provider.emitFakeEvent("follow", { user: { id: "1", uniqueId: "follower_a" } });

    await waitFor(() => pipeline!.ttsProvider.calls.length === 1);
    expect(pipeline.ttsProvider.calls[0].text).toBe("Cảm ơn follower_a đã follow!");
  });

  it("Scenario 2: Gift Rose -> Rule -> Sound -> TTS -> Overlay", async () => {
    const rules = [
      rule({
        trigger: { eventType: "gift" },
        conditions: { op: "equals", field: "payload.giftName", value: "Rose" } as ConditionNode,
        actions: [
          { type: "sound", payload: { file: "rose.mp3" } },
          { type: "tts", payload: { template: "Cảm ơn {username} đã tặng {giftName}!" } },
        ] as RuleAction[],
      }),
    ];
    pipeline = await createTestPipeline(rules);

    pipeline.provider.emitFakeEvent("gift", {
      gift: { id: "1", name: "Rose", diamondCount: 1 },
      repeatCount: 1,
      repeatEnd: 1,
      user: { id: "2", uniqueId: "gifter_a" },
    });

    await waitFor(() => pipeline!.outcomes.length === 1 && pipeline!.outcomes[0].outcomes.length === 2);
    const [soundOutcome, ttsOutcome] = pipeline.outcomes[0].outcomes;
    expect(soundOutcome).toMatchObject({ actionIndex: 0, actionType: "sound", status: "success" });
    expect(ttsOutcome).toMatchObject({ actionIndex: 1, actionType: "tts", status: "success" });

    // Overlay phải nhận đủ: liveEvent (gift) + soundReady + ttsReady.
    await waitFor(() => pipeline!.overlayMessages.some((m) => m.type === "soundReady"));
    await waitFor(() => pipeline!.overlayMessages.some((m) => m.type === "ttsReady"));
    expect(pipeline.overlayMessages.some((m) => m.type === "liveEvent")).toBe(true);
  });

  it("Scenario 3: Comment + Condition -> TTS (chỉ khớp khi comment chứa từ khoá)", async () => {
    const rules = [
      rule({
        trigger: { eventType: "comment" },
        conditions: { op: "contains", field: "payload.text", value: "hello" } as ConditionNode,
        actions: [{ type: "tts", payload: { template: "hi {username}" } }],
      }),
    ];
    pipeline = await createTestPipeline(rules);

    // Comment không khớp điều kiện -> KHÔNG được có action nào chạy.
    pipeline.provider.emitFakeEvent("chat", { content: "good morning", user: { id: "3", uniqueId: "c1" } });
    await waitFor(() => pipeline!.liveEvents.length === 1);

    // Comment khớp điều kiện -> action chạy.
    pipeline.provider.emitFakeEvent("chat", { content: "hello everyone", user: { id: "4", uniqueId: "c2" } });
    await waitFor(() => pipeline!.ttsProvider.calls.length === 1);

    expect(pipeline.ttsProvider.calls).toHaveLength(1);
    expect(pipeline.ttsProvider.calls[0].text).toBe("hi c2");
  });

  it("Scenario 4: nhiều event đồng thời -> queue -> actions thực thi đúng thứ tự (không chồng)", async () => {
    const rules = [rule({ trigger: { eventType: "follow" }, actions: [{ type: "tts", payload: { template: "hi {username}" } }] })];
    pipeline = await createTestPipeline(rules);

    // Bắn 5 follow event gần như đồng thời.
    for (let i = 0; i < 5; i++) {
      pipeline.provider.emitFakeEvent("follow", { user: { id: String(i), uniqueId: `user_${i}` } });
    }

    await waitFor(() => pipeline!.ttsProvider.calls.length === 5);
    // TTSQueue tuần tự -> thứ tự xử lý PHẢI đúng thứ tự event được bắn ra.
    expect(pipeline.ttsProvider.calls.map((c) => c.text)).toEqual([
      "hi user_0",
      "hi user_1",
      "hi user_2",
      "hi user_3",
      "hi user_4",
    ]);
  });

  it("Scenario 5: mất kết nối TikTok -> tự reconnect -> event vẫn được xử lý sau khi nối lại", async () => {
    const rules = [rule({ trigger: { eventType: "follow" }, actions: [{ type: "tts", payload: { template: "hi {username}" } }] })];
    pipeline = await createTestPipeline(rules);

    expect(pipeline.manager.getState()).toBe("connected");

    pipeline.provider.simulateUnexpectedDisconnect("network lost (giả lập)");
    expect(pipeline.manager.getState()).toBe("reconnecting");

    await waitFor(() => pipeline!.manager.getState() === "connected", 3000);

    // Sau khi reconnect, event mới vẫn phải chạy được qua toàn bộ pipeline.
    pipeline.provider.emitFakeEvent("follow", { user: { id: "9", uniqueId: "after_reconnect" } });
    await waitFor(() => pipeline!.ttsProvider.calls.length === 1);
    expect(pipeline.ttsProvider.calls[0].text).toBe("hi after_reconnect");
  });

  it("Scenario 6: action lỗi -> retry -> nếu vẫn lỗi thì ghi nhận failed, không chặn action khác/event khác", async () => {
    const rules = [
      rule({
        trigger: { eventType: "follow" },
        actions: [
          { type: "always-fails", payload: {} },
          { type: "tts", payload: { template: "hi {username}" } },
        ] as RuleAction[],
      }),
    ];
    pipeline = await createTestPipeline(rules);

    let attempts = 0;
    pipeline.registerHandler({
      type: "always-fails",
      maxRetries: 2,
      async execute() {
        attempts += 1;
        throw new Error("giả lập lỗi vĩnh viễn");
      },
    });

    pipeline.provider.emitFakeEvent("follow", { user: { id: "5", uniqueId: "user_fail" } });

    await waitFor(() => pipeline!.outcomes.length === 1 && pipeline!.outcomes[0].outcomes.length === 2);
    const [failedOutcome, ttsOutcome] = pipeline.outcomes[0].outcomes;

    expect(attempts).toBe(3); // 1 lần đầu + 2 retry
    expect(failedOutcome).toMatchObject({ actionType: "always-fails", status: "failed" });
    // Action tts (action thứ 2) VẪN chạy dù action đầu lỗi vĩnh viễn (NFR-4).
    expect(ttsOutcome).toMatchObject({ actionType: "tts", status: "success" });

    // Event tiếp theo vẫn được xử lý bình thường (lỗi không làm chết pipeline).
    pipeline.provider.emitFakeEvent("follow", { user: { id: "6", uniqueId: "user_after_fail" } });
    await waitFor(() => pipeline!.liveEvents.length === 2);
  });
});
