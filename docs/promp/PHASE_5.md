# Prompt 05 — Implement TikTok LIVE Event Receiver

Đọc:

* `docs/research/*`
* `docs/architecture/*`
* `docs/implementation/*`

Bạn đang ở MILESTONE M01.

## Mục tiêu

Xây module có thể kết nối tới TikTok LIVE và nhận realtime events theo approach đã được PHASE 01 xác định.

## Quy tắc

1. Không hard-code credentials.
2. Không commit secrets.
3. Không phá architecture hiện tại.
4. Không thêm dependency nếu không cần thiết.
5. Nếu sử dụng unofficial library, phải cô lập nó trong adapter.
6. Core system không được phụ thuộc trực tiếp vào library-specific event object.

## Architecture

```text
TikTok Library
      ↓
TikTokAdapter
      ↓
Internal LiveEvent
```

## Implement

* Connection manager
* Reconnection
* Connection state
* Event listener
* Error handling
* Logging
* Graceful shutdown.

## Tests

Phải có:

* Unit test
* Mock event test
* Connection failure test
* Reconnection test.

Nếu không thể test live TikTok thật:

Tạo mock event provider.

## Acceptance

Có thể chạy:

`npm run dev`

và nhận được event dạng normalized:

```json
{
  "type": "follow",
  "username": "test_user"
}
```

hoặc event tương ứng thực tế.

## Report

Tạo:

`docs/reports/M01-REPORT.md`

Report:

* Implemented
* Files changed
* Dependency added
* Tests
* Actual test result
* Live test result
* Known limitations
* Next step.

Nếu live connection không hoạt động, KHÔNG giả vờ thành công.

Dừng.
