import { z } from "zod";

// Xem docs/architecture/RULE-ENGINE.md — nguồn sự thật cho schema này.

export const liveEventTypeForTriggerSchema = z.enum([
  "follow",
  "like",
  "comment",
  "share",
  "gift",
  "join",
  // Không phải sự kiện thật từ TikTok — trigger "hết giờ": tự bắn ra khi live IM
  // LẶNG quá `idleSeconds` giây (không có event thật nào), lặp lại mỗi idleSeconds
  // giây trong lúc vẫn im lặng. Dùng để tự động nhắc/chat filler khi live vắng
  // tương tác quá lâu (yêu cầu người dùng). Xem live-session/session-manager.ts.
  "idle",
]);

const comparisonConditionSchema = z.object({
  op: z.enum(["equals", "notEquals", "contains", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"]),
  field: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type ConditionNode =
  | { op: "and"; nodes: ConditionNode[] }
  | { op: "or"; nodes: ConditionNode[] }
  | z.infer<typeof comparisonConditionSchema>;

export const conditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("and"), nodes: z.array(conditionNodeSchema) }),
    z.object({ op: z.literal("or"), nodes: z.array(conditionNodeSchema) }),
    comparisonConditionSchema,
  ]),
);

export const ruleActionSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
});
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const automationRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number(),
  trigger: z.object({
    eventType: liveEventTypeForTriggerSchema,
    // Chỉ có ý nghĩa khi eventType === "idle" — số giây im lặng trước khi tự đọc,
    // và lặp lại mỗi ngần ấy giây trong lúc vẫn im lặng. Mặc định 20s ở UI/server
    // nếu không truyền (xem automation-builder-logic.ts / session-manager.ts).
    idleSeconds: z.number().min(5).max(3600).optional(),
  }),
  conditions: conditionNodeSchema.nullable(),
  actions: z.array(ruleActionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;
