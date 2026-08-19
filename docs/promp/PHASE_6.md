# Prompt 06 — Event Normalizer

Đọc architecture và M01 report.

Implement Event Normalizer.

## Mục tiêu

Chuyển mọi TikTok-specific event thành internal event schema.

Ví dụ:

```json
{
  "id": "uuid",
  "type": "gift",
  "timestamp": "...",
  "streamId": "...",
  "user": {
    "id": "...",
    "username": "..."
  },
  "payload": {
    "giftId": "...",
    "giftName": "Rose",
    "count": 1
  }
}
```

## Event types

Implement những event đã được PHASE 01 xác nhận khả dụng.

Không tự bịa event.

## Requirements

- Stable schema
- Validation
- Type safety
- Unit tests
- Unknown event handling
- Versioning strategy.

Sau khi hoàn thành:

Tạo:

`docs/reports/M02-REPORT.md`

Report chính xác những event đã test thành công.

Dừng.
