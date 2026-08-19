import { describe, expect, it, vi } from "vitest";
import { ConnectionManager } from "../connection-manager.js";
import { MockProvider } from "../providers/mock-provider.js";

/**
 * Dưới vi.useFakeTimers(), setImmediate cũng bị fake — không thể dùng nó để
 * flush microtask. Dùng advanceTimersByTimeAsync(0) để chạy hết microtask queue
 * mà không thực sự trôi thời gian giả lập.
 */
function flushMicrotasks() {
  return vi.advanceTimersByTimeAsync(0);
}

describe("ConnectionManager", () => {
  it("connects successfully and transitions idle -> connecting -> connected", async () => {
    const provider = new MockProvider();
    const manager = new ConnectionManager(provider);
    const states: string[] = [];
    manager.on("stateChange", (s: string) => states.push(s));

    expect(manager.getState()).toBe("idle");
    await manager.connect("streamer1");

    expect(manager.getState()).toBe("connected");
    expect(states).toEqual(["connecting", "connected"]);
    expect(provider.isConnected()).toBe(true);
  });

  it("forwards mock events emitted by the provider", async () => {
    const provider = new MockProvider();
    const manager = new ConnectionManager(provider);
    const received: unknown[] = [];
    manager.on("event", (e: unknown) => received.push(e));

    await manager.connect("streamer1");
    provider.emitFakeEvent("chat", { comment: "hi" });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ name: "chat", data: { comment: "hi" } });
  });

  it("emits error and schedules reconnect when initial connect fails", async () => {
    vi.useFakeTimers();
    try {
      const provider = new MockProvider();
      provider.failNextConnect = true;
      const manager = new ConnectionManager(provider, {
        baseReconnectDelayMs: 100,
        maxReconnectDelayMs: 1000,
        maxReconnectAttempts: 5,
      });

      const errors: unknown[] = [];
      manager.on("connectionError", (e: unknown) => errors.push(e));

      const connectPromise = manager.connect("streamer1");
      await connectPromise;
      await flushMicrotasks();

      expect(errors).toHaveLength(1);
      expect(manager.getState()).toBe("reconnecting");

      // Tua timer đủ để trigger attemptConnect kế tiếp (lần này sẽ thành công).
      await vi.advanceTimersByTimeAsync(2000);

      expect(manager.getState()).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects after an unexpected disconnect", async () => {
    vi.useFakeTimers();
    try {
      const provider = new MockProvider();
      const manager = new ConnectionManager(provider, {
        baseReconnectDelayMs: 100,
        maxReconnectDelayMs: 1000,
      });

      await manager.connect("streamer1");
      expect(manager.getState()).toBe("connected");

      provider.simulateUnexpectedDisconnect("network error");
      expect(manager.getState()).toBe("reconnecting");

      await vi.advanceTimersByTimeAsync(2000);

      expect(manager.getState()).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying and moves to error state after maxReconnectAttempts", async () => {
    vi.useFakeTimers();
    try {
      const provider = new MockProvider();
      const manager = new ConnectionManager(provider, {
        baseReconnectDelayMs: 10,
        maxReconnectDelayMs: 20,
        maxReconnectAttempts: 2,
      });

      // Ép mọi lần connect đều thất bại.
      provider.connect = async () => {
        throw new Error("always fails");
      };

      await manager.connect("streamer1");
      await flushMicrotasks();

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      expect(manager.getState()).toBe("error");
    } finally {
      vi.useRealTimers();
    }
  });

  it("graceful shutdown stops reconnect attempts and disconnects", async () => {
    const provider = new MockProvider();
    const manager = new ConnectionManager(provider);

    await manager.connect("streamer1");
    await manager.stop();

    expect(manager.getState()).toBe("disconnected");
    expect(provider.isConnected()).toBe(false);
  });
});
