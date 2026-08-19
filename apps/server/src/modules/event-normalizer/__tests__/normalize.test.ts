import { describe, expect, it } from "vitest";
import { normalizeAndValidate } from "../index.js";
import type { AdapterEvent } from "../../tiktok-adapter/types.js";

function adapterEvent(name: string, data: unknown): AdapterEvent {
  return { name, data, receivedAt: new Date().toISOString() };
}

describe("normalizeAndValidate", () => {
  it("normalizes a chat event into a comment LiveEvent", () => {
    const result = normalizeAndValidate(
      adapterEvent("chat", { content: "hello world", user: { id: "1", uniqueId: "abc" } }),
      "stream-1",
    );

    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({
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
    expect(result.event).toMatchObject({
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
    expect(result.event).toMatchObject({ type: "follow", payload: {} });
  });

  it("normalizes a like event with count", () => {
    const result = normalizeAndValidate(
      adapterEvent("like", { count: 5, total: "120", user: { id: "4", uniqueId: "liker1" } }),
      "stream-1",
    );

    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({
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
    expect(result.event).toMatchObject({ type: "share" });
  });

  it("normalizes a member (join) event", () => {
    const result = normalizeAndValidate(
      adapterEvent("member", { user: { id: "6", uniqueId: "joiner1" }, memberCount: 42 }),
      "stream-1",
    );
    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({ type: "join", payload: { viewerCount: 42 } });
  });

  it("normalizes a roomUser (viewer count) event without a specific user", () => {
    const result = normalizeAndValidate(adapterEvent("roomUser", { totalUser: "999" }), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({
      type: "join",
      user: { username: "unknown" },
      payload: { viewerCount: 999 },
    });
  });

  it("falls back to unknown event for unmapped event names, without throwing", () => {
    const result = normalizeAndValidate(adapterEvent("someWeirdEvent", { foo: "bar" }), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({
      type: "unknown",
      payload: { originalType: "someWeirdEvent" },
    });
  });

  it("falls back gracefully when user is missing entirely", () => {
    const result = normalizeAndValidate(adapterEvent("follow", {}), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({ user: { id: "unknown", username: "unknown" } });
  });

  it("never throws even when data is null — falls back to safe defaults", () => {
    // data = null không được làm normalize throw (defensive: event.data ?? {}).
    expect(() => normalizeAndValidate(adapterEvent("gift", null), "stream-1")).not.toThrow();
    const result = normalizeAndValidate(adapterEvent("gift", null), "stream-1");
    expect(result.ok).toBe(true);
    expect(result.event).toMatchObject({
      type: "gift",
      payload: { giftId: "unknown", giftName: "unknown", isStreakEnd: false },
    });
  });
});
