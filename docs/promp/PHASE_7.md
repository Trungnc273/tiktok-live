# Prompt 07 — Automation Rule Engine

Đọc:

* PRD
* RULE-ENGINE.md
* EVENT-MODEL.md
* M01/M02 reports.

Implement Rule Engine.

## Concept

```text
EVENT
 ↓
MATCH TRIGGER
 ↓
EVALUATE CONDITIONS
 ↓
EXECUTE ACTIONS
```

Ví dụ:

```text
WHEN gift.name == "Rose"

THEN:
  sound("rose.mp3")
  tts("Cảm ơn {username}!")
  overlay("rose")
```

## Engine phải hỗ trợ

### Trigger

* event type

### Conditions

* equals
* not equals
* contains
* greater than
* less than
* greater/equal
* logical AND
* logical OR.

### Actions

Ban đầu chỉ cần abstract action dispatcher.

Không implement tất cả action ngay.

## Quan trọng

Rule Engine không được biết chi tiết TTS, OBS hoặc audio implementation.

Nó chỉ dispatch:

```typescript
Action {
  type: string
  payload: unknown
}
```

## Tests

Phải test:

* trigger match
* trigger mismatch
* condition
* AND
* OR
* multiple rules
* rule priority
* disabled rule
* invalid rule
* action ordering.

Tạo:

`docs/reports/M03-REPORT.md`

Dừng.
