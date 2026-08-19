import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { StatusTracker } from "../status-tracker.js";

function ev(type: LiveEvent["type"], payload: unknown): LiveEvent {
  return {
    schemaVersion: 1,
    id: "e1",
    timestamp: new Date().toISOString(),
    streamId: "s1",
    type,
    user: { id: "u1", username: "u" },
    payload,
  } as LiveEvent;
}

describe("StatusTracker", () => {
  it("cập nhật connectionState", () => {
    const tracker = new StatusTracker();
    tracker.setConnectionState("connected");
    expect(tracker.snapshot().connectionState).toBe("connected");
  });

  it("đếm follow/comment/share/gift theo số lượng event", () => {
    const tracker = new StatusTracker();
    tracker.recordEvent(ev("follow", {}));
    tracker.recordEvent(ev("follow", {}));
    tracker.recordEvent(ev("comment", { text: "hi" }));
    tracker.recordEvent(ev("share", {}));
    tracker.recordEvent(ev("gift", { giftId: "1", giftName: "Rose", count: 1, isStreakEnd: true }));

    expect(tracker.snapshot().counts).toEqual({ follow: 2, like: 0, comment: 1, share: 1, gift: 1 });
  });

  it("cộng dồn count của like event (không phải +1 mỗi event)", () => {
    const tracker = new StatusTracker();
    tracker.recordEvent(ev("like", { count: 5 }));
    tracker.recordEvent(ev("like", { count: 3 }));
    expect(tracker.snapshot().counts.like).toBe(8);
  });

  it("cập nhật viewerCount từ join event", () => {
    const tracker = new StatusTracker();
    expect(tracker.snapshot().viewerCount).toBeNull();
    tracker.recordEvent(ev("join", { viewerCount: 42 }));
    expect(tracker.snapshot().viewerCount).toBe(42);
  });
});
