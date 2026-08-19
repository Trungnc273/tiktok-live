import { describe, expect, it } from "vitest";
import { normalizeAndValidate } from "../index.js";
import type { AdapterEvent } from "../../tiktok-adapter/types.js";

function adapterEvent(name: string, data: unknown): AdapterEvent {
  return { name, data, receivedAt: new Date().toISOString() };
}

describe("normalizeAndValidate — id deterministic (PHASE 14 audit finding H1)", () => {
  it("cùng 1 raw event (kể cả common.msgId) -> normalize 2 lần cho ra CÙNG 1 id", () => {
    const raw = adapterEvent("gift", {
      common: { msgId: "msg-123" },
      gift: { id: "1", name: "Rose", diamondCount: 1 },
      repeatCount: 1,
      repeatEnd: 1,
      user: { id: "u1", uniqueId: "gifter" },
    });

    const first = normalizeAndValidate(raw, "stream-1");
    const second = normalizeAndValidate(raw, "stream-1");

    expect(first.ok && second.ok).toBe(true);
    expect(first.ok ? first.event.id : null).toBe(second.ok ? second.event.id : null);
  });

  it("cùng payload nhưng KHÔNG có common.msgId (fallback hash) -> vẫn ra CÙNG 1 id", () => {
    const raw = adapterEvent("follow", { user: { id: "u2", uniqueId: "follower_x" } });

    const first = normalizeAndValidate(raw, "stream-1");
    const second = normalizeAndValidate(raw, "stream-1");

    expect(first.ok ? first.event.id : null).toBe(second.ok ? second.event.id : null);
  });

  it("2 event khác nội dung -> id khác nhau (không phải hash cố định cho mọi thứ)", () => {
    const a = normalizeAndValidate(adapterEvent("follow", { user: { id: "1", uniqueId: "a" } }), "stream-1");
    const b = normalizeAndValidate(adapterEvent("follow", { user: { id: "2", uniqueId: "b" } }), "stream-1");
    expect(a.ok ? a.event.id : null).not.toBe(b.ok ? b.event.id : null);
  });
});

describe("normalizeAndValidate", () => {
  it("normalizes a chat event into a comment LiveEvent", () => {
    const result = normalizeAndValidate(
      adapterEvent("chat", { content: "hello world", user: { id: "1", uniqueId: "abc" } }),
      "stream-1",
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({
      type: "comment",
      user: { id: "1", username: "abc" },
      payload: { text: "hello world" },
    });
  });

  it("normalizes a gift event, marking streak end correctly", () => {
    const result = normalizeAndValidate(
      adapterEvent("gift", {
        gift: { id: "5655", name: "Rose", diamondCount: 1 },
        repeatCount: 3,
        repeatEnd: 1,
        user: { id: "2", uniqueId: "gifter" },
      }),
      "stream-1",
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({
      type: "gift",
      payload: {
        giftId: "5655",
        giftName: "Rose",
        count: 3,
        diamondValue: 1,
        isStreakEnd: true,
      },
    });
  });

  it("normalizes a follow event with empty payload", () => {
    const result = normalizeAndValidate(
      adapterEvent("follow", { user: { id: "3", uniqueId: "follower1" } }),
      "stream-1",
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({ type: "follow", payload: {} });
  });

  it("normalizes a like event with count", () => {
    const result = normalizeAndValidate(
      adapterEvent("like", { count: 5, total: "120", user: { id: "4", uniqueId: "liker1" } }),
      "stream-1",
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({
      type: "like",
      payload: { count: 5, totalLikeCount: 120 },
    });
  });

  it("normalizes a share event", () => {
    const result = normalizeAndValidate(
      adapterEvent("share", { user: { id: "5", uniqueId: "sharer1" } }),
      "stream-1",
    );
    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({ type: "share" });
  });

  it("normalizes a member (join) event", () => {
    const result = normalizeAndValidate(
      adapterEvent("member", { user: { id: "6", uniqueId: "joiner1" }, memberCount: 42 }),
      "stream-1",
    );
    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({ type: "join", payload: { viewerCount: 42 } });
  });

  it("normalizes a roomUser (viewer count) event without a specific user", () => {
    const result = normalizeAndValidate(adapterEvent("roomUser", { totalUser: "999" }), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({
      type: "join",
      user: { username: "unknown" },
      payload: { viewerCount: 999 },
    });
  });

  it("falls back to unknown event for unmapped event names, without throwing", () => {
    const result = normalizeAndValidate(adapterEvent("someWeirdEvent", { foo: "bar" }), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({
      type: "unknown",
      payload: { originalType: "someWeirdEvent" },
    });
  });

  it("falls back gracefully when user is missing entirely", () => {
    const result = normalizeAndValidate(adapterEvent("follow", {}), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({ user: { id: "unknown", username: "unknown" } });
  });

  it("never throws even when data is null — falls back to safe defaults", () => {
    // data = null không được làm normalize throw (defensive: event.data ?? {}).
    expect(() => normalizeAndValidate(adapterEvent("gift", null), "stream-1")).not.toThrow();
    const result = normalizeAndValidate(adapterEvent("gift", null), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.ok ? result.event : undefined).toMatchObject({
      type: "gift",
      payload: { giftId: "unknown", giftName: "unknown", isStreakEnd: false },
    });
  });
});
