import type { AutomationRule } from "@tiktok-live/shared-types";

/**
 * Whitelist field cho phép tham chiếu trong ConditionNode, theo từng eventType
 * CÓ THỂ LÀM TRIGGER (không gồm "unknown" — RULE-ENGINE.md không cho phép tạo
 * trigger khớp "unknown" ở MVP). Validate lúc TẠO rule (không phải lúc chạy).
 */
type TriggerEventType = AutomationRule["trigger"]["eventType"];

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
