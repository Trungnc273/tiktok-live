import type { AutomationRule } from "./rule.js";

/**
 * Whitelist field cho phép tham chiếu trong ConditionNode, theo từng eventType
 * CÓ THỂ LÀM TRIGGER (không gồm "unknown"). Dùng chung giữa server (validate lúc
 * tạo rule) và dashboard (gợi ý field trong Automation Builder) — tránh 2 nơi định
 * nghĩa lệch nhau (docs/architecture/RULE-ENGINE.md).
 */
export type TriggerEventType = AutomationRule["trigger"]["eventType"];

const COMMON_FIELDS = ["user.id", "user.username"];

export const FIELD_WHITELIST: Record<TriggerEventType, string[]> = {
  follow: [...COMMON_FIELDS],
  share: [...COMMON_FIELDS],
  like: [...COMMON_FIELDS, "payload.count", "payload.totalLikeCount"],
  comment: [...COMMON_FIELDS, "payload.text"],
  gift: [
    ...COMMON_FIELDS,
    "payload.giftId",
    "payload.giftName",
    "payload.count",
    "payload.diamondValue",
    "payload.isStreakEnd",
  ],
  join: [...COMMON_FIELDS, "payload.viewerCount"],
};

export function isFieldAllowed(eventType: TriggerEventType, field: string): boolean {
  return FIELD_WHITELIST[eventType].includes(field);
}
