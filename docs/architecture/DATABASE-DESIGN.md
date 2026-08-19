# DATABASE-DESIGN.md

PostgreSQL. MVP không có bảng `users`/auth (PRD: multi-user là Future/Out of scope) — chỉ 1 admin ngầm định dùng dashboard local, không cần login ở MVP. Bảng `users` sẽ được thêm ở Future roadmap khi multi-tenant được kích hoạt chính thức, không tạo trước "để sẵn" (tránh over-engineering).

## ERD (dạng text)

```text
stream_sessions
  id              uuid PK
  tiktok_username text NOT NULL
  status          text NOT NULL   -- 'connecting' | 'live' | 'disconnected' | 'error'
  started_at      timestamptz
  ended_at        timestamptz NULL
  created_at      timestamptz NOT NULL DEFAULT now()

automations
  id              uuid PK
  name            text NOT NULL
  enabled         boolean NOT NULL DEFAULT true
  priority        integer NOT NULL DEFAULT 100
  trigger_event_type text NOT NULL          -- 'follow' | 'like' | 'comment' | 'share' | 'gift' | 'join'
  conditions      jsonb NULL                -- ConditionNode | null, xem RULE-ENGINE.md
  actions         jsonb NOT NULL            -- RuleAction[], xem RULE-ENGINE.md
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()

events_log
  id              uuid PK              -- = LiveEvent.id
  stream_session_id uuid NULL REFERENCES stream_sessions(id)
  type            text NOT NULL
  payload         jsonb NOT NULL
  user_id         text NULL
  username        text NULL
  received_at     timestamptz NOT NULL DEFAULT now()
  -- Index: (stream_session_id, received_at), (type)

execution_logs
  id              uuid PK
  event_id        uuid NOT NULL REFERENCES events_log(id)
  automation_id   uuid NOT NULL REFERENCES automations(id)
  action_index    integer NOT NULL     -- vị trí action trong mảng actions của rule tại thời điểm chạy
  action_type     text NOT NULL
  status          text NOT NULL        -- 'success' | 'failed' | 'timeout' | 'skipped'
  error           text NULL
  started_at      timestamptz NOT NULL
  finished_at     timestamptz NULL
  -- Index: (event_id, automation_id, action_index) UNIQUE -- hỗ trợ idempotency (SYSTEM-ARCHITECTURE.md)
```

## Quan hệ

- `stream_sessions (1) → (n) events_log`
- `automations (1) → (n) execution_logs`
- `events_log (1) → (n) execution_logs`

## Ghi chú thiết kế

- `conditions`/`actions` lưu dạng `jsonb` thay vì chuẩn hoá thành bảng con — vì cấu trúc cây điều kiện lồng nhau (AND/OR) khó biểu diễn quan hệ mà không phức tạp hoá quá mức cho MVP; đánh đổi: không query được "tất cả rule dùng field X" bằng SQL thuần, chấp nhận được ở MVP vì số lượng rule của 1 streamer nhỏ (không phải vấn đề hiệu năng).
- `execution_logs` có unique constraint `(event_id, automation_id, action_index)` để tránh ghi trùng khi action-engine được gọi lại (hỗ trợ idempotency).
- `events_log` không lưu vô hạn — cần chính sách retention (ví dụ giữ 30 ngày) để tránh phình DB khi live nhiều giờ mỗi ngày; **chưa quyết định con số cụ thể ở MVP, để lại UNKNOWN cho PHASE 04 (implementation plan) cụ thể hoá thành 1 task dọn dẹp định kỳ**.

## Migration

- Dùng 1 công cụ migration đơn giản gắn với ORM/query builder được chọn ở PHASE 04/05 (ví dụ Drizzle hoặc Prisma) — **chưa chốt cụ thể ở phase kiến trúc này**, đây là chi tiết implementation, không phải quyết định kiến trúc.
