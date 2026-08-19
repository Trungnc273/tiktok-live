# MULTITENANT-AUTH-REPORT.md — Auth + Multi-tenant (bổ sung sau MVP/M15)

Người dùng yêu cầu ngày 2026-08-19: thêm đăng nhập + trang quản lý admin, dùng cho nhiều người (miễn phí, chia sẻ người quen), đăng ký email/mật khẩu đơn giản không xác minh.

## Quyết định kiến trúc

- **Người đăng ký đầu tiên = admin tự động** (bootstrap pattern phổ biến).
- **Auth**: JWT trong cookie httpOnly (không session store riêng, không localStorage — tránh lộ token qua XSS).
- **Mật khẩu**: `bcryptjs` (pure JS, không cần build native — quan trọng vì hướng tới khả năng deploy Linux VPS).
- **Cách ly dữ liệu**: thêm cột `ownerId` (không đặt tên `userId` để tránh nhầm với "người xem TikTok" đã có sẵn ý nghĩa khác trong `events_log`) trên `automations`, `stream_sessions`. Mọi query đều filter theo `ownerId` ở tầng repository — không dựa vào tầng trên (route) nhớ filter đúng.
- **Overlay/Dashboard realtime**: từ "broadcast toàn cục" (MVP gốc) chuyển sang **Socket.IO room riêng theo từng `ownerId`** — cả namespace `/overlay` (xác thực qua token 1-1 với owner) lẫn `/dashboard` (xác thực qua JWT cookie, không còn "tin tưởng local network" như ghi chú cũ vì giờ nhiều người dùng chung server).
- **Kết nối TikTok**: `LiveSessionManager` mới — thay thế "1 `ConnectionManager` toàn cục" bằng "N `ConnectionManager` độc lập, 1 cho mỗi user đang bật theo dõi live", mỗi session có `StatusTracker` riêng.

## Files mới

- `apps/server/src/modules/auth/` — `password.ts`, `auth-plugin.ts` (JWT+cookie, decorator `authenticate`/`requireAdmin`), `auth-routes.ts` (register/login/logout/me/tiktok-username), `admin-routes.ts` (list/disable/enable user).
- `apps/server/src/modules/persistence/users-repository.ts`.
- `apps/server/src/modules/live-session/session-manager.ts` — `LiveSessionManager`.
- Migration Drizzle mới: bảng `users`, cột `owner_id` trên `automations`/`stream_sessions`.

## Files thay đổi lớn

- `overlay-gateway/gateway.ts` — room theo owner, `broadcast()` bắt buộc `ownerId`, `TokenStore` gắn token↔ownerId.
- `action-engine/types.ts` — `ActionContext` thêm `ownerId` (để TTS/Sound handler biết phát overlay cho đúng người).
- `api/http-server.ts` — mọi route automations/status/events/overlays yêu cầu `app.authenticate`, scope theo `req.user.id`; thêm `/api/live/start`, `/api/live/stop`.
- `persistence/automations-repository.ts`, `events-repository.ts` — mọi method nhận thêm `ownerId`.
- `main.ts` — viết lại hoàn toàn: không còn tự kết nối TikTok khi khởi động, chờ user tự bấm "bắt đầu theo dõi".

## Tests

**Thêm/sửa test ở hầu hết module hiện có**, cộng 2 test **cách ly multi-tenant** quan trọng nhất:

1. `gateway.test.ts` — "CÁCH LY MULTI-TENANT: broadcast cho owner A không lộ sang client của owner B" (kết nối 2 client thật, broadcast cho A, xác nhận B không nhận được gì sau 100ms chờ).
2. `automations-api.integration.test.ts` — "CÁCH LY MULTI-TENANT: owner khác không thấy/xoá được automation của owner này" (owner B không thấy automation của A trong list, DELETE trả 404 thay vì 403 — tránh lộ tồn tại/IDOR).
3. `events-repository.integration.test.ts` — `getRecent` chỉ trả event của đúng owner (join qua `stream_sessions.owner_id`).

## Actual test result

```text
apps/server: Test Files 19 passed (19) | Tests 124 passed (124)
```

`npm run lint` và `npm run typecheck --workspace=apps/server` sạch. `npm run build --workspace=apps/server` thành công.

## Verify thật (không chỉ test tự động)

Chạy server thật (Postgres thật, `MOCK_TIKTOK=1`), qua script gọi REST API như client thật:

1. Đăng ký 2 user thật qua `/api/auth/register` — user đầu tiên nhận `role: "admin"`, user thứ 2 nhận `role: "user"` — **đúng như yêu cầu**.
2. `PUT /api/auth/tiktok-username` + `POST /api/live/start` cho user A — trả `200 {ok:true}`.
3. Tạo automation `comment → TTS` cho A qua `POST /api/automations`.
4. Chờ mock event bắn (comment giả lập mỗi 5s trong `LiveSessionManager`) → khớp rule → TTS thật chạy.
5. **Xác nhận qua `execution_logs` join `automations` join `users`**: đúng 1 dòng `status='success'`, `action_type='tts'`, gắn đúng email của user A — chứng minh action thật chạy đúng người, không lẫn.
6. `GET /api/automations` bằng cookie của B → **0 kết quả** (không thấy automation của A).
7. `GET /api/status` của A → `connectionState: "connected"`, đếm đúng 1 comment. `GET /api/status` của B → `connectionState: "idle"` (hoàn toàn không bị ảnh hưởng bởi phiên live của A).

Đây là bằng chứng thật, độc lập với test tự động — dữ liệu được kiểm tra trực tiếp trong Postgres, không suy đoán.

## Known limitations

1. **Chưa có UI đăng nhập/đăng ký/admin ở `apps/dashboard`** — backend đã sẵn sàng đầy đủ, frontend đang làm tiếp theo (xem trao đổi với người dùng).
2. **JWT_SECRET ngẫu nhiên nếu không cấu hình** — mỗi lần restart server, mọi người dùng bị đăng xuất. Đã log cảnh báo rõ ràng, cần đặt cố định trong `.env` cho môi trường thật.
3. **`TTSQueue` vẫn dùng chung toàn server** (không tách theo owner) — gift bão của user A về lý thuyết có thể làm chậm TTS của user B đang live cùng lúc. Chấp nhận được cho quy mô "vài người quen dùng chung", cần tách nếu scale lớn hơn.
4. **Rủi ro pháp lý tăng theo số người dùng** (đã nêu ở PRD, PHASE 01) — người dùng đã được thông báo và xác nhận chấp nhận trước khi quyết định hướng multi-tenant miễn phí này.

## Next step

Frontend: trang Login/Register cho `apps/dashboard`, bảo vệ route (redirect nếu chưa đăng nhập), trang cài đặt (nhập `tiktokUsername`, nút bắt đầu/dừng theo dõi live), trang admin (list user, disable/enable) — chỉ hiện khi `role === "admin"`.
