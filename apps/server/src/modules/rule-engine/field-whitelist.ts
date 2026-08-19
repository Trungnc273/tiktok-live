// Định nghĩa gốc chuyển sang packages/shared-types để dùng chung với apps/dashboard
// (Automation Builder cần biết field hợp lệ theo từng eventType) — tránh 2 nơi định
// nghĩa lệch nhau (docs/architecture/RULE-ENGINE.md).
export { FIELD_WHITELIST, isFieldAllowed, type TriggerEventType } from "@tiktok-live/shared-types";
