import { z } from "zod";

// Xem docs/architecture/RULE-ENGINE.md — nguồn sự thật cho schema này.

export const liveEventTypeForTriggerSchema = z.enum([
  "follow",
  "like",
  "comment",
  "share",
  "gift",
  "join",
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
  trigger: z.object({ eventType: liveEventTypeForTriggerSchema }),
  conditions: conditionNodeSchema.nullable(),
  actions: z.array(ruleActionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;
