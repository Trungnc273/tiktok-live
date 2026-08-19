# RULE-ENGINE.md

## Concept

```text
LiveEvent
 ↓
MATCH TRIGGER (event.type == rule.trigger.eventType)
 ↓
EVALUATE CONDITIONS (rule.conditions)
 ↓
DISPATCH ACTIONS (rule.actions, theo thứ tự, tới Action Engine)
```

Rule Engine **không biết** chi tiết TTS/OBS/audio implementation — chỉ tạo ra danh sách `Action { type, payload }` và giao cho Action Engine (xem `SYSTEM-ARCHITECTURE.md`).

## Rule schema

```typescript
interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;          // số nhỏ hơn chạy trước; mặc định theo thứ tự tạo nếu bằng nhau
  trigger: {
    eventType: LiveEventType; // "follow" | "like" | "comment" | "share" | "gift" | "join"
  };
  conditions: ConditionNode | null; // null = luôn khớp (không điều kiện thêm)
  actions: RuleAction[];      // thực thi theo thứ tự mảng
  createdAt: string;
  updatedAt: string;
}

type ConditionNode =
  | { op: "and"; nodes: ConditionNode[] }
  | { op: "or"; nodes: ConditionNode[] }
  | { op: "equals"; field: string; value: unknown }
  | { op: "notEquals"; field: string; value: unknown }
  | { op: "contains"; field: string; value: string }
  | { op: "greaterThan"; field: string; value: number }
  | { op: "lessThan"; field: string; value: number }
  | { op: "greaterOrEqual"; field: string; value: number }
  | { op: "lessOrEqual"; field: string; value: number };
```

- `field` là đường dẫn tới thuộc tính trong `LiveEvent` đã chuẩn hoá, ví dụ `payload.giftName`, `payload.count`, `user.username`. Không cho phép truy cập field tuỳ ý ngoài whitelist theo từng `eventType` (tránh rule tham chiếu field không tồn tại rồi luôn `false` một cách khó hiểu — validate ở lúc tạo rule, không phải lúc chạy).

## Action schema (abstract — Rule Engine chỉ biết tới đây)

```typescript
interface RuleAction {
  type: string;        // "tts" | "sound" | "overlay" | "websocket" | ... — Action Engine diễn giải
  payload: unknown;    // cấu trúc cụ thể do từng ActionHandler định nghĩa (xem PHASE 08/09/10)
}
```

Rule Engine **không** implement tất cả action ngay (đúng yêu cầu PHASE 07) — chỉ định nghĩa abstract dispatcher này; các handler cụ thể được implement ở milestone M04/M05/M06.

## Evaluation algorithm

1. Nhận `LiveEvent` từ `event-bus`.
2. Lọc `enabled === true` và `trigger.eventType === event.type`.
3. Sắp xếp theo `priority` tăng dần (rule priority thấp hơn chạy trước); bằng nhau → giữ thứ tự `createdAt`.
4. Với mỗi rule (theo thứ tự), evaluate `conditions` (nếu `null` → coi như khớp).
5. Rule khớp → gửi toàn bộ `actions` (theo đúng thứ tự mảng) cho Action Engine dưới dạng 1 batch gắn `ruleId` + `eventId`.
6. **Mặc định MVP: tất cả rule khớp đều được thực thi** (không dừng ở rule đầu tiên khớp) — vì use case thực tế (PRD ví dụ "Gift Rose → Sound + TTS + Overlay") thường muốn nhiều rule cùng phản ứng độc lập với 1 event. Cờ "dừng sau rule đầu tiên khớp" (stop-on-match) để ngỏ cho Phase 2 nếu cần, chưa có ở MVP — ghi rõ đây là quyết định thiết kế, không phải thiếu sót.

## Tests bắt buộc (theo PHASE 07)

- trigger match / trigger mismatch
- từng loại condition (equals, notEquals, contains, greaterThan, lessThan, greaterOrEqual, lessOrEqual)
- AND / OR (bao gồm lồng nhau)
- multiple rules cùng khớp 1 event
- rule priority (thứ tự thực thi đúng)
- disabled rule (không được thực thi)
- invalid rule (field không thuộc whitelist của eventType → reject lúc tạo, không phải lúc chạy)
- action ordering (actions trong 1 rule chạy đúng thứ tự khai báo)
