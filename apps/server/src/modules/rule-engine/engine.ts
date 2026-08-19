import type { AutomationRule, LiveEvent, RuleAction } from "@tiktok-live/shared-types";
import { evaluateCondition } from "./condition-evaluator.js";

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  eventId: string;
  actions: RuleAction[];
}

/**
 * Đánh giá toàn bộ rule cho 1 LiveEvent, trả về danh sách rule KHỚP kèm actions
 * theo thứ tự dispatch cho Action Engine (M05) — đúng thuật toán
 * docs/architecture/RULE-ENGINE.md:
 *
 * 1. Lọc enabled + đúng trigger.eventType.
 * 2. Sắp theo priority tăng dần (bằng nhau -> giữ thứ tự createdAt).
 * 3. Evaluate conditions (null = luôn khớp).
 * 4. MẶC ĐỊNH: trả về TẤT CẢ rule khớp, không dừng ở rule đầu tiên (quyết định
 *    thiết kế tường minh, không phải thiếu sót — xem RULE-ENGINE.md).
 */
export function evaluateRules(rules: AutomationRule[], event: LiveEvent): RuleMatch[] {
  const candidates = rules
    .filter((rule) => rule.enabled && rule.trigger.eventType === event.type)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt.localeCompare(b.createdAt);
    });

  const matches: RuleMatch[] = [];
  for (const rule of candidates) {
    const matched = rule.conditions === null || evaluateCondition(rule.conditions, event);
    if (matched) {
      matches.push({ ruleId: rule.id, ruleName: rule.name, eventId: event.id, actions: rule.actions });
    }
  }
  return matches;
}
