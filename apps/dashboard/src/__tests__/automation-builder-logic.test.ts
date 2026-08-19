import { describe, expect, it } from "vitest";
import { buildAutomationInput, emptyBuilderState, validateBuilderState } from "../automation-builder-logic.js";

describe("automation-builder-logic", () => {
  it("emptyBuilderState() không hợp lệ (chưa có action)", () => {
    expect(validateBuilderState(emptyBuilderState()).valid).toBe(false);
  });

  it("buildAutomationInput chuyển state thành payload API đúng cấu trúc RULE-ENGINE.md", () => {
    const state = {
      name: "Gift Rose -> TTS + Sound",
      triggerEventType: "gift" as const,
      condition: { field: "payload.giftName", op: "equals" as const, value: "Rose" },
      actions: [
        { type: "sound" as const, file: "rose.mp3" },
        { type: "tts" as const, template: "Cảm ơn {username}!" },
      ],
    };

    const input = buildAutomationInput(state);

    expect(input).toEqual({
      name: "Gift Rose -> TTS + Sound",
      enabled: true,
      priority: 100,
      trigger: { eventType: "gift" },
      conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
      actions: [
        { type: "sound", payload: { file: "rose.mp3" } },
        { type: "tts", payload: { template: "Cảm ơn {username}!" } },
      ],
    });
  });

  it("condition với operator số chuyển value sang number", () => {
    const state = {
      name: "test",
      triggerEventType: "gift" as const,
      condition: { field: "payload.diamondValue", op: "greaterThan" as const, value: "5" },
      actions: [{ type: "tts" as const, template: "hi" }],
    };
    const input = buildAutomationInput(state);
    expect(input.conditions).toEqual({ op: "greaterThan", field: "payload.diamondValue", value: 5 });
  });

  it("condition = null khi không cấu hình điều kiện", () => {
    const state = {
      name: "test",
      triggerEventType: "follow" as const,
      condition: null,
      actions: [{ type: "tts" as const, template: "hi" }],
    };
    expect(buildAutomationInput(state).conditions).toBeNull();
  });

  it("validateBuilderState báo lỗi khi tên rỗng hoặc action rỗng nội dung", () => {
    const result = validateBuilderState({
      name: "",
      triggerEventType: "gift",
      condition: null,
      actions: [{ type: "tts", template: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
