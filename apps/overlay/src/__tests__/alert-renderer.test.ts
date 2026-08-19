import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { describeAlert } from "../alert-renderer.js";

function base(overrides: Partial<LiveEvent>): LiveEvent {
  return {
    schemaVersion: 1,
    id: "e1",
    timestamp: new Date().toISOString(),
    streamId: "s1",
    user: { id: "u1", username: "vidu_user" },
    ...overrides,
  } as LiveEvent;
}

describe("describeAlert", () => {
  it("hiển thị đúng cho follow event", () => {
    const content = describeAlert(base({ type: "follow", payload: {} }));
    expect(content?.title).toContain("vidu_user");
    expect(content?.className).toContain("alert-follow");
  });

  it("hiển thị đúng cho gift event, kèm giftName và count", () => {
    const content = describeAlert(
      base({
        type: "gift",
        payload: { giftId: "1", giftName: "Rose", count: 3, diamondValue: 1, isStreakEnd: true },
      }),
    );
    expect(content?.title).toBe("vidu_user tặng Rose x3!");
    expect(content?.subtitle).toBe("1 diamond");
  });

  it("hiển thị đúng cho comment event, kèm nội dung comment", () => {
    const content = describeAlert(base({ type: "comment", payload: { text: "hello there" } }));
    expect(content?.title).toBe("vidu_user");
    expect(content?.subtitle).toBe("hello there");
  });

  it("hiển thị đúng cho share event", () => {
    const content = describeAlert(base({ type: "share", payload: {} }));
    expect(content?.className).toContain("alert-share");
  });

  it("không hiện alert cho like/join/unknown (tránh spam)", () => {
    expect(describeAlert(base({ type: "like", payload: { count: 1 } }))).toBeNull();
    expect(describeAlert(base({ type: "join", payload: {} }))).toBeNull();
    expect(describeAlert(base({ type: "unknown", payload: { originalType: "x" } }))).toBeNull();
  });
});
