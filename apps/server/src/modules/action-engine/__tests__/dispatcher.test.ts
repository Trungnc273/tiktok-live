import { describe, expect, it, vi } from "vitest";
import type { RuleMatch } from "../../rule-engine/index.js";
import { ActionDispatcher } from "../dispatcher.js";
import { HandlerRegistry } from "../handler-registry.js";
import { MemoryExecutionLogPort } from "../memory-execution-log.js";
import type { ActionContext, ActionHandler } from "../types.js";

function ctx(): ActionContext {
  return {
    ruleId: "rule-1",
    ruleName: "Test Rule",
    ownerId: "owner-1",
    event: {
      schemaVersion: 1,
      id: "event-1",
      timestamp: new Date().toISOString(),
      streamId: "stream-1",
      type: "gift",
      user: { id: "u1", username: "gifter" },
      payload: { giftId: "1", giftName: "Rose", count: 1, isStreakEnd: true },
    } as never,
  };
}

function match(actions: { type: string; payload: unknown }[]): RuleMatch {
  return { ruleId: "rule-1", ruleName: "Test Rule", eventId: "event-1", actions };
}

describe("ActionDispatcher", () => {
  it("thực thi action thành công và ghi log status=success", async () => {
    const registry = new HandlerRegistry();
    const execute = vi.fn().mockResolvedValue(undefined);
    registry.register({ type: "tts", execute } satisfies ActionHandler);
    const logPort = new MemoryExecutionLogPort();
    const dispatcher = new ActionDispatcher(registry, logPort);

    const outcomes = await dispatcher.dispatch(match([{ type: "tts", payload: { text: "hi" } }]), ctx());

    expect(outcomes).toEqual([{ actionIndex: 0, actionType: "tts", status: "success" }]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(logPort.getRecord({ eventId: "event-1", automationId: "rule-1", actionIndex: 0, actionType: "tts" })?.status).toBe(
      "success",
    );
  });

  it("action thất bại được ghi status=failed nhưng KHÔNG chặn action kế tiếp", async () => {
    const registry = new HandlerRegistry();
    registry.register({ type: "sound", execute: vi.fn().mockRejectedValue(new Error("boom")) });
    const ttsExecute = vi.fn().mockResolvedValue(undefined);
    registry.register({ type: "tts", execute: ttsExecute });
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      match([
        { type: "sound", payload: {} },
        { type: "tts", payload: {} },
      ]),
      ctx(),
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].error).toBe("boom");
    expect(outcomes[1].status).toBe("success");
    expect(ttsExecute).toHaveBeenCalledTimes(1); // action thứ 2 vẫn chạy dù action đầu lỗi
  });

  it("action vượt timeout được ghi status=timeout", async () => {
    const registry = new HandlerRegistry();
    registry.register({
      type: "slow",
      timeoutMs: 20,
      execute: () => new Promise((resolve) => setTimeout(resolve, 200)),
    });
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(match([{ type: "slow", payload: {} }]), ctx());

    expect(outcomes[0].status).toBe("timeout");
  });

  it("retry: thử lại đúng số lần khai báo rồi mới thành công", async () => {
    const registry = new HandlerRegistry();
    let attempts = 0;
    registry.register({
      type: "flaky",
      maxRetries: 2,
      execute: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("tạm thời lỗi");
      },
    });
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(match([{ type: "flaky", payload: {} }]), ctx());

    expect(attempts).toBe(3); // 1 lần đầu + 2 retry
    expect(outcomes[0].status).toBe("success");
  });

  it("retry: hết số lần retry vẫn lỗi -> status=failed", async () => {
    const registry = new HandlerRegistry();
    const execute = vi.fn().mockRejectedValue(new Error("luôn lỗi"));
    registry.register({ type: "always-fails", maxRetries: 2, execute });
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(match([{ type: "always-fails", payload: {} }]), ctx());

    expect(execute).toHaveBeenCalledTimes(3); // 1 + 2 retry
    expect(outcomes[0].status).toBe("failed");
  });

  it("idempotency: cùng (eventId, ruleId, actionIndex) không được thực thi lần 2", async () => {
    const registry = new HandlerRegistry();
    const execute = vi.fn().mockResolvedValue(undefined);
    registry.register({ type: "tts", execute });
    const logPort = new MemoryExecutionLogPort();
    const dispatcher = new ActionDispatcher(registry, logPort);
    const m = match([{ type: "tts", payload: {} }]);

    await dispatcher.dispatch(m, ctx());
    const secondOutcomes = await dispatcher.dispatch(m, ctx());

    expect(execute).toHaveBeenCalledTimes(1); // KHÔNG chạy lần 2
    expect(secondOutcomes[0].status).toBe("skipped");
  });

  it("action type chưa có handler đăng ký -> skipped, không throw, không chặn action khác", async () => {
    const registry = new HandlerRegistry();
    const ttsExecute = vi.fn().mockResolvedValue(undefined);
    registry.register({ type: "tts", execute: ttsExecute });
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      match([
        { type: "not-implemented-yet", payload: {} },
        { type: "tts", payload: {} },
      ]),
      ctx(),
    );

    expect(outcomes[0].status).toBe("skipped");
    expect(outcomes[1].status).toBe("success");
  });
});
