import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { buildTemplateVariables } from "../template-variables.js";

function giftEvent(user: Partial<LiveEvent["user"]> = {}): LiveEvent {
  return {
    schemaVersion: 1,
    id: "00000000-0000-0000-0000-000000000000",
    timestamp: new Date().toISOString(),
    streamId: "s1",
    user: { id: "u1", username: "nguyenvana123", ...user },
    type: "gift",
    payload: { giftId: "g1", giftName: "Rose", count: 1, isStreakEnd: true },
  };
}

describe("buildTemplateVariables", () => {
  it("nickname = tên hiển thị thật khi TikTok có trả về (đọc tự nhiên hơn @handle)", () => {
    const vars = buildTemplateVariables(giftEvent({ nickname: "Nguyễn Văn A" }));
    expect(vars.nickname).toBe("Nguyễn Văn A");
    expect(vars.username).toBe("nguyenvana123"); // vẫn giữ nguyên, không bị ghi đè
  });

  it("nickname fallback về username khi TikTok không trả nickname", () => {
    const vars = buildTemplateVariables(giftEvent({ nickname: undefined }));
    expect(vars.nickname).toBe("nguyenvana123");
  });
});
