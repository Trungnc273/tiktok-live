# M03-REPORT.md — Event Storage / Logging

## Implemented

- `docker-compose.yml` — Postgres 16 riêng cho dự án (`tiktok-live-postgres`, port `127.0.0.1:5544`, không đụng container Postgres khác đang chạy trên máy dev cho dự án khác).
- `.env.example` — mẫu biến môi trường (`DATABASE_URL`, `TIKTOK_USERNAME`, `EULER_STREAM_API_KEY`, `LOG_LEVEL`).
- ORM/migration: **Drizzle** (`drizzle-orm` + `drizzle-kit`) — chốt quyết định để ngỏ từ `MILESTONES.md`.
- `apps/server/src/modules/persistence/`:
  - `schema.ts` — 4 bảng đúng `DATABASE-DESIGN.md`: `stream_sessions`, `automations`, `events_log`, `execution_logs` (kèm unique index chống ghi trùng execution).
  - `db.ts` — `createDb()` tạo kết nối Drizzle/postgres-js.
  - `events-repository.ts` — `createStreamSession()`, `recordEvent()`.
  - `migrate.ts` — script chạy migration thật (`npm run db:migrate`).
  - `index.ts` — export công khai.
- Migration `drizzle/0000_safe_mole_man.sql` đã generate và **chạy thật** trên Postgres, tạo đủ 4 bảng (xác nhận bằng `\dt`).
- Nối vào `apps/server/src/main.ts`: tạo `stream_sessions` record khi khởi động, ghi mỗi `LiveEvent` vào `events_log` theo kiểu **fire-and-forget** (không `await` chặn xử lý event tiếp theo) — lỗi DB chỉ log cảnh báo, không làm dừng nhận event từ TikTok.

## Database changes

Tạo mới 4 bảng (`stream_sessions`, `automations`, `events_log`, `execution_logs`) — `automations`/`execution_logs` tạo trước theo schema đầy đủ dù chưa dùng tới ở M03 (sẽ dùng ở M04/M05), tránh phải chạy thêm 1 migration rời chỉ để thêm 2 bảng còn thiếu.

## Tests

12 test mới, tổng cộng **19/19 test pass** (6 M01 + 10 M02 + 3 M03), chạy thật với Postgres qua Docker:

1. Tạo stream session + ghi/đọc lại `LiveEvent` đúng dữ liệu (không phải mock).
2. Ghi event không gắn session (`streamSessionId: null`) vẫn thành công.
3. Ghi trùng `id` → reject Promise rõ ràng (nhờ `id` là primary key, không âm thầm mất dữ liệu hay ghi đè).

## Actual test result

```text
Test Files  3 passed (3)
     Tests  19 passed (19)
```

`npm run typecheck` và `npm run build` sạch. Trong lúc sửa để đạt được điều này, đã đổi `NormalizeResult` (M02) từ interface với field optional sang **discriminated union đúng nghĩa** (`{ ok: true; event } | { ok: false; error }`) — sửa lỗi type thật (TypeScript không tự narrow `event` là non-undefined chỉ vì `ok` là `boolean`), không phải workaround.

## Verify thật ngoài test tự động

Chạy `apps/server` thật (`tsx src/main.ts`) với Postgres thật đang chạy qua Docker:

1. Server tạo `stream_sessions` row khi khởi động (log + xác nhận bằng `psql`).
2. MockProvider bắn 1 event giả lập sau 5s → normalize → ghi vào `events_log`.
3. Query trực tiếp bằng `psql`: `events_log` có đúng 1 row với `type='comment'`, `username='test_user'`, `payload={"text":"hello"}`, `stream_session_id` khớp đúng session vừa tạo.

Đây là bằng chứng thật (query DB độc lập với code test), không chỉ dựa vào assertion trong vitest.

## Ghi chú vận hành

- Postgres của dự án này chạy ở **port 5544** (không phải 5432 mặc định) để tránh xung đột với 1 container Postgres khác (`hoadon-db`, port 5433) đã có sẵn trên máy dev cho 1 dự án không liên quan — đã kiểm tra trước khi tạo, không đụng vào.
- `docker compose up -d` (từ thư mục gốc dự án) để khởi động DB; `npm run db:migrate --workspace=apps/server` để chạy migration.

## Known limitations

- Chưa implement chính sách retention cho `events_log` (đã ghi UNKNOWN ở PHASE 03) — để lại cho milestone sau nếu cần, không chặn M03.
- `createStreamSession` hiện được gọi 1 lần khi start process; chưa cập nhật `status`/`ended_at` khi kết nối TikTok chuyển trạng thái (`connected` → `error` → ...) — đây là phần "đồng bộ trạng thái session" chưa nằm trong yêu cầu tối thiểu của M03 (chỉ yêu cầu lưu event log), sẽ bổ sung khi cần cho Dashboard (M10).

## Next step

M04 — Rule Engine: implement match trigger + evaluate conditions + dispatch actions theo `RULE-ENGINE.md`, đọc `automations` từ bảng đã tạo sẵn ở M03.
