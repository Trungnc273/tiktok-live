import { describe, expect, it } from "vitest";
import type { AutomationRule } from "@tiktok-live/shared-types";
import {
  buildAutomationInput,
  emptyBuilderState,
  hasUnsupportedActions,
  ruleToBuilderState,
  validateBuilderState,
} from "../automation-builder-logic.js";

describe("automation-builder-logic", () => {
  it("emptyBuilderState() không hợp lệ (chưa có action)", () => {
    expect(validateBuilderState(emptyBuilderState()).valid).toBe(false);
  });

  it("buildAutomationInput chuyển state thành payload API đúng cấu trúc RULE-ENGINE.md", () => {
    const state = {
      name: "Gift Rose -> TTS + Sound",
      triggerEventType: "gift" as const,
      idleSeconds: 20,
      condition: { field: "payload.giftName", op: "equals" as const, value: "Rose" },
      actions: [
        { type: "sound" as const, file: "rose.mp3" },
        { type: "tts" as const, template: "Cảm ơn {username}!", lang: "vi" },
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
        { type: "tts", payload: { template: "Cảm ơn {username}!", lang: "vi" } },
      ],
    });
  });

  it("condition với operator số chuyển value sang number", () => {
    const state = {
      name: "test",
      triggerEventType: "gift" as const,
      idleSeconds: 20,
      condition: { field: "payload.diamondValue", op: "greaterThan" as const, value: "5" },
      actions: [{ type: "tts" as const, template: "hi", lang: "vi" }],
    };
    const input = buildAutomationInput(state);
    expect(input.conditions).toEqual({ op: "greaterThan", field: "payload.diamondValue", value: 5 });
  });

  it("condition = null khi không cấu hình điều kiện", () => {
    const state = {
      name: "test",
      triggerEventType: "follow" as const,
      idleSeconds: 20,
      condition: null,
      actions: [{ type: "tts" as const, template: "hi", lang: "vi" }],
    };
    expect(buildAutomationInput(state).conditions).toBeNull();
  });

  it("validateBuilderState báo lỗi khi tên rỗng hoặc action rỗng nội dung", () => {
    const result = validateBuilderState({
      name: "",
      triggerEventType: "gift",
      idleSeconds: 20,
      condition: null,
      actions: [{ type: "tts", template: "", lang: "vi" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
    return {
      id: "r1",
      name: "Gift Rose",
      enabled: true,
      priority: 100,
      trigger: { eventType: "gift" },
      conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
      actions: [
        { type: "sound", payload: { file: "rose.mp3" } },
        { type: "tts", payload: { template: "Cảm ơn {username}!", lang: "en" } },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("ruleToBuilderState chuyển automation đã lưu -> state form đúng ngược lại với buildAutomationInput", () => {
    const state = ruleToBuilderState(rule());
    expect(state).toEqual({
      name: "Gift Rose",
      triggerEventType: "gift",
      idleSeconds: 20,
      condition: { field: "payload.giftName", op: "equals", value: "Rose" },
      actions: [
        { type: "sound", file: "rose.mp3" },
        { type: "tts", template: "Cảm ơn {username}!", lang: "en" },
      ],
    });
    // Round-trip: build lại từ state vừa convert phải khớp dữ liệu gốc (trừ id/timestamps).
    expect(buildAutomationInput(state)).toEqual({
      name: rule().name,
      enabled: true,
      priority: 100,
      trigger: rule().trigger,
      conditions: rule().conditions,
      actions: rule().actions,
    });
  });

  it("buildAutomationInput trigger idle mang theo idleSeconds đã chọn", () => {
    const state = {
      name: "Nhắc khi im lặng",
      triggerEventType: "idle" as const,
      idleSeconds: 45,
      condition: null,
      actions: [{ type: "tts" as const, template: "Còn ai xem không nè!", lang: "vi" }],
    };
    expect(buildAutomationInput(state).trigger).toEqual({ eventType: "idle", idleSeconds: 45 });
  });

  it("validateBuilderState báo lỗi khi idleSeconds dưới mức tối thiểu (5s)", () => {
    const result = validateBuilderState({
      name: "test",
      triggerEventType: "idle",
      idleSeconds: 2,
      condition: null,
      actions: [{ type: "tts", template: "hi", lang: "vi" }],
    });
    expect(result.valid).toBe(false);
  });

  it("ruleToBuilderState đọc lại idleSeconds từ automation idle đã lưu", () => {
    const state = ruleToBuilderState(
      rule({ trigger: { eventType: "idle", idleSeconds: 30 }, conditions: null }),
    );
    expect(state.triggerEventType).toBe("idle");
    expect(state.idleSeconds).toBe(30);
  });

  it("ruleToBuilderState mặc định lang=vi khi automation cũ chưa có field lang", () => {
    const state = ruleToBuilderState(rule({ actions: [{ type: "tts", payload: { template: "hi" } }] }));
    expect(state.actions).toEqual([{ type: "tts", template: "hi", lang: "vi" }]);
  });

  it("ruleToBuilderState bỏ qua điều kiện dạng AND/OR (builder chỉ hỗ trợ so sánh đơn)", () => {
    const state = ruleToBuilderState(rule({ conditions: { op: "and", nodes: [] } }));
    expect(state.condition).toBeNull();
  });

  it("ruleToBuilderState lọc bỏ action loại không hỗ trợ (vd obs.sceneChange)", () => {
    const state = ruleToBuilderState(
      rule({
        actions: [
          { type: "obs.sceneChange", payload: { scene: "x" } },
          { type: "tts", payload: { template: "hi", lang: "vi" } },
        ],
      }),
    );
    expect(state.actions).toEqual([{ type: "tts", template: "hi", lang: "vi" }]);
  });

  it("hasUnsupportedActions true khi có action ngoài tts/sound", () => {
    expect(hasUnsupportedActions(rule({ actions: [{ type: "obs.sceneChange", payload: {} }] }))).toBe(true);
    expect(hasUnsupportedActions(rule())).toBe(false);
  });
});
