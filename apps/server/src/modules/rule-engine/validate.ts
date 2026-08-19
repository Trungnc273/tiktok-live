import type { AutomationRule, ConditionNode } from "@tiktok-live/shared-types";
import { isFieldAllowed } from "./field-whitelist.js";

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
}

function collectInvalidFields(
  node: ConditionNode,
  eventType: AutomationRule["trigger"]["eventType"],
  errors: string[],
): void {
  if (node.op === "and" || node.op === "or") {
    for (const child of node.nodes) collectInvalidFields(child, eventType, errors);
    return;
  }
  if (!isFieldAllowed(eventType, node.field)) {
    errors.push(`Field "${node.field}" không hợp lệ cho eventType "${eventType}"`);
  }
}

/**
 * Validate rule LÚC TẠO/SỬA — không phải lúc chạy (docs/architecture/RULE-ENGINE.md).
 * Rule tham chiếu field ngoài whitelist bị reject ngay, tránh rule "luôn false" một
 * cách khó hiểu khi vận hành thật.
 */
export function validateRule(rule: AutomationRule): RuleValidationResult {
  const errors: string[] = [];

  if (rule.name.trim().length === 0) errors.push("Tên rule không được rỗng");
  if (rule.actions.length === 0) errors.push("Rule phải có ít nhất 1 action");

  if (rule.conditions) {
    collectInvalidFields(rule.conditions, rule.trigger.eventType, errors);
  }

  return { valid: errors.length === 0, errors };
}
