import { describe, expect, it } from "vitest";
import type { AutomationRule, ConditionNode, LiveEvent } from "@tiktok-live/shared-types";
import { evaluateRules } from "../engine.js";
import { validateRule } from "../validate.js";

let ruleCounter = 0;
function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  ruleCounter += 1;
  return {
    id: `rule-${ruleCounter}`,
    name: `Rule ${ruleCounter}`,
    enabled: true,
    priority: 100,
    trigger: { eventType: "gift" },
    conditions: null,
    actions: [{ type: "tts", payload: { text: "hi" } }],
    createdAt: new Date(2026, 0, ruleCounter).toISOString(),
    updatedAt: new Date(2026, 0, ruleCounter).toISOString(),
    ...overrides,
  };
}

function giftEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    schemaVersion: 1,
    id: "event-1",
    timestamp: new Date().toISOString(),
    streamId: "stream-1",
    type: "gift",
    user: { id: "u1", username: "gifter" },
    payload: { giftId: "5655", giftName: "Rose", count: 1, diamondValue: 1, isStreakEnd: true },
    ...overrides,
  } as LiveEvent;
}

describe("evaluateRules", () => {
  it("trigger match: rule khớp đúng eventType được thực thi", () => {
    const matches = evaluateRules([rule({ trigger: { eventType: "gift" } })], giftEvent());
    expect(matches).toHaveLength(1);
  });

  it("trigger mismatch: rule khác eventType không được thực thi", () => {
    const matches = evaluateRules([rule({ trigger: { eventType: "follow" } })], giftEvent());
    expect(matches).toHaveLength(0);
  });

  it.each([
    ["equals", "payload.giftName", "Rose", true],
    ["equals", "payload.giftName", "Lion", false],
    ["notEquals", "payload.giftName", "Lion", true],
    ["notEquals", "payload.giftName", "Rose", false],
    ["contains", "payload.giftName", "Ro", true],
    ["contains", "payload.giftName", "xyz", false],
    ["greaterThan", "payload.diamondValue", 0, true],
    ["greaterThan", "payload.diamondValue", 5, false],
    ["lessThan", "payload.diamondValue", 5, true],
    ["lessThan", "payload.diamondValue", 0, false],
    ["greaterOrEqual", "payload.diamondValue", 1, true],
    ["lessOrEqual", "payload.diamondValue", 1, true],
  ] as const)("condition %s %s %s -> %s", (op, field, value, expected) => {
    const condition = { op, field, value } as ConditionNode;
    const matches = evaluateRules([rule({ conditions: condition })], giftEvent());
    expect(matches.length === 1).toBe(expected);
  });

  it("AND: chỉ khớp khi tất cả điều kiện con đúng", () => {
    const condition: ConditionNode = {
      op: "and",
      nodes: [
        { op: "equals", field: "payload.giftName", value: "Rose" },
        { op: "greaterThan", field: "payload.diamondValue", value: 0 },
      ],
    };
    expect(evaluateRules([rule({ conditions: condition })], giftEvent())).toHaveLength(1);

    const failing: ConditionNode = {
      op: "and",
      nodes: [
        { op: "equals", field: "payload.giftName", value: "Rose" },
        { op: "greaterThan", field: "payload.diamondValue", value: 999 },
      ],
    };
    expect(evaluateRules([rule({ conditions: failing })], giftEvent())).toHaveLength(0);
  });

  it("OR: khớp khi ít nhất 1 điều kiện con đúng", () => {
    const condition: ConditionNode = {
      op: "or",
      nodes: [
        { op: "equals", field: "payload.giftName", value: "Lion" },
        { op: "equals", field: "payload.giftName", value: "Rose" },
      ],
    };
    expect(evaluateRules([rule({ conditions: condition })], giftEvent())).toHaveLength(1);
  });

  it("nested AND/OR", () => {
    const condition: ConditionNode = {
      op: "and",
      nodes: [
        { op: "equals", field: "payload.giftName", value: "Rose" },
        {
          op: "or",
          nodes: [
            { op: "greaterThan", field: "payload.diamondValue", value: 999 },
            { op: "equals", field: "payload.isStreakEnd", value: true },
          ],
        },
      ],
    };
    expect(evaluateRules([rule({ conditions: condition })], giftEvent())).toHaveLength(1);
  });

  it("multiple rules cùng khớp 1 event -> tất cả đều được trả về", () => {
    const rules = [rule({ id: "a" }), rule({ id: "b" }), rule({ id: "c" })];
    const matches = evaluateRules(rules, giftEvent());
    expect(matches.map((m) => m.ruleId)).toEqual(["a", "b", "c"]);
  });

  it("rule priority: priority nhỏ hơn chạy trước", () => {
    const rules = [
      rule({ id: "low-priority", priority: 200, createdAt: "2026-01-01T00:00:00.000Z" }),
      rule({ id: "high-priority", priority: 10, createdAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const matches = evaluateRules(rules, giftEvent());
    expect(matches.map((m) => m.ruleId)).toEqual(["high-priority", "low-priority"]);
  });

  it("priority bằng nhau -> giữ thứ tự createdAt", () => {
    const rules = [
      rule({ id: "later", priority: 100, createdAt: "2026-01-02T00:00:00.000Z" }),
      rule({ id: "earlier", priority: 100, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const matches = evaluateRules(rules, giftEvent());
    expect(matches.map((m) => m.ruleId)).toEqual(["earlier", "later"]);
  });

  it("disabled rule không được thực thi", () => {
    const matches = evaluateRules([rule({ enabled: false })], giftEvent());
    expect(matches).toHaveLength(0);
  });

  it("invalid rule: field ngoài whitelist bị validateRule() reject lúc tạo", () => {
    const badRule = rule({
      trigger: { eventType: "follow" },
      conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
    });
    const result = validateRule(badRule);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("payload.giftName");
  });

  it("valid rule: field trong whitelist được chấp nhận", () => {
    const goodRule = rule({
      trigger: { eventType: "gift" },
      conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
    });
    expect(validateRule(goodRule).valid).toBe(true);
  });

  it("action ordering: actions trong 1 rule giữ nguyên thứ tự khai báo", () => {
    const actions = [
      { type: "sound", payload: { file: "a.mp3" } },
      { type: "tts", payload: { text: "hi" } },
      { type: "overlay", payload: { effect: "rose" } },
    ];
    const matches = evaluateRules([rule({ actions })], giftEvent());
    expect(matches[0].actions.map((a) => a.type)).toEqual(["sound", "tts", "overlay"]);
  });
});
