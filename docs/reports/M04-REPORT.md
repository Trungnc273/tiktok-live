# M04-REPORT.md — Automation Rule Engine

## Implemented

- `packages/shared-types/src/rule.ts` — Zod schema dùng chung: `ConditionNode` (đệ quy, hỗ trợ AND/OR lồng nhau), `RuleAction` (abstract `{type, payload}`), `AutomationRule`.
- `apps/server/src/modules/rule-engine/`:
  - `field-whitelist.ts` — whitelist field cho phép tham chiếu trong condition, theo từng `trigger.eventType` (không gồm `"unknown"` — rule engine không cho tạo trigger khớp event chưa xác định).
  - `condition-evaluator.ts` — `evaluateCondition()`: đọc field qua dot-notation, so sánh (`equals`, `notEquals`, `contains`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`), đệ quy AND/OR.
  - `validate.ts` — `validateRule()`: reject rule tham chiếu field ngoài whitelist **lúc tạo/sửa**, không phải lúc chạy.
  - `engine.ts` — `evaluateRules()`: match trigger → sort priority → evaluate conditions → trả về **tất cả** rule khớp (không dừng ở rule đầu tiên, quyết định thiết kế tường minh theo `RULE-ENGINE.md`).
  - `index.ts` — export công khai.

## Requirements đã đáp ứng

- Trigger: match theo `event type`.
- Conditions: đủ 7 operator (`equals`, `notEquals`, `contains`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`) + `AND`/`OR` lồng nhau.
- Actions: chỉ dispatch `RuleAction { type: string, payload: unknown }` — Rule Engine **không biết** chi tiết TTS/OBS/audio (đúng PHASE 07), chưa implement handler nào ở milestone này.

## Tests

24 test mới trong `engine.test.ts`, bao phủ đúng danh sách bắt buộc của `RULE-ENGINE.md`:

trigger match, trigger mismatch, 7 condition operator (dùng `it.each`), AND, OR, nested AND/OR, multiple rules cùng khớp, rule priority, priority bằng nhau giữ thứ tự tạo, disabled rule, invalid rule (field ngoài whitelist), valid rule, action ordering.

## Actual test result

```text
Test Files  4 passed (4)
     Tests  43 passed (43)   (19 từ M01-M03 + 24 từ M04)
```

`npm run typecheck` và `npm run build` sạch. Sự cố phát hiện trong lúc code: `FIELD_WHITELIST: Record<LiveEventType, string[]>` ban đầu bắt buộc phải có key `"unknown"` (vì `LiveEventType` gồm cả `unknown`) dù rule engine cố tình không cho trigger trên `unknown` — sửa bằng cách dùng type hẹp hơn (`AutomationRule["trigger"]["eventType"]`, không có `unknown`) thay vì `LiveEventType` đầy đủ.

## Known limitations

- Chưa nối `evaluateRules()` vào pipeline thật trong `main.ts` (đọc `automations` từ DB, gọi khi có `LiveEvent`) — cố ý để lại cho M05 (Action Engine), vì kết quả `evaluateRules()` (RuleMatch[]) chỉ có ý nghĩa đầy đủ khi có Action Engine để dispatch. Nối riêng rule-engine vào main.ts mà chưa có nơi tiêu thụ actions sẽ chỉ log ra, không kiểm chứng được gì thêm.
- Chưa có API/repository đọc `automations` từ Postgres (bảng đã tạo ở M03, nhưng chưa có code đọc) — sẽ làm cùng M05 khi cần rule thật thay vì fixture trong test.

## Next step

M05 — Action Engine: Action Dispatcher + Handler registry, nối `rule-engine` (M04) → `action-engine` → (stub handler cho tới M06-M08), đọc `automations` thật từ DB.
