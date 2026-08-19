# M08-REPORT.md — Realtime Overlay

## Implemented

### Backend
- `apps/server/src/modules/overlay-gateway/`:
  - `token-store.ts` — `TokenStore`: token per-overlay-instance, in-memory (MVP).
  - `gateway.ts` — `OverlayGateway`: Socket.IO server, namespace `/overlay` yêu cầu token hợp lệ (middleware `use()` reject connection sai token), `broadcast(type, data)` gắn `sequence` tăng dần. Reconnect/heartbeat dùng cơ chế có sẵn của Socket.IO.
- `apps/server/src/modules/api/http-server.ts` — Fastify: `GET /health`, `POST /api/overlays` (tạo token + URL overlay).
- `packages/shared-types/src/overlay.ts` — `OverlayMessage` schema dùng chung server/overlay.
- Nối vào `apps/server/src/main.ts`: mọi `LiveEvent` hợp lệ (M02) được broadcast qua `overlayGateway.broadcast("liveEvent", event)` — **chưa qua Rule Engine** (cố ý, xem Known limitations).

### Frontend — `apps/overlay` (React + Vite, app mới)
- `alert-renderer.ts` — `describeAlert()`: hàm thuần chuyển `LiveEvent` → nội dung alert (follow/gift/comment/share có alert; like/join/unknown không hiện để tránh spam).
- `sequence-guard.ts` — `SequenceGuard`: duplicate protection theo sequence (đúng `REALTIME-ARCHITECTURE.md`).
- `Alert.tsx`, `App.tsx`, `main.tsx` — component React thật, kết nối Socket.IO qua token trong URL query, render danh sách alert có tự động biến mất sau 6s, hiển thị trạng thái mất kết nối.

## Tests

**14 test mới** (5 `gateway.test.ts`, 3 `http-server.test.ts`, 5 `alert-renderer.test.ts`, 2 `sequence-guard.test.ts`, 2 `Alert.test.tsx`):

- Gateway: từ chối token sai, chấp nhận token đúng, **"Fake Gift Event → backend → WebSocket → client nhận đúng gift event"** (đúng nguyên văn chuỗi verification bắt buộc của `PHASE_10.md`), sequence tăng dần, reconnect cơ bản.
- HTTP: health check, tạo token/URL, mỗi lần gọi sinh token khác nhau.
- Overlay app: `describeAlert()` cho từng loại event, `SequenceGuard` dedup, component `Alert` render đúng title/subtitle.

## Actual test result

```text
apps/server:   Test Files 13 passed (13) | Tests 82 passed (82)   (74 từ M01-M07 + 8 từ M08 phần backend)
apps/overlay:  Test Files 3 passed (3)   | Tests 9 passed (9)     (toàn bộ mới)
```

`npm run typecheck` và `npm run build` sạch cho cả `apps/server` và `apps/overlay` (Vite build thật ra `dist/`, không chỉ typecheck).

## Verification full-stack thật (không chỉ test tự động)

Chạy `apps/server` thật (Postgres thật) + 1 script Node độc lập đóng vai overlay client thật (dùng `socket.io-client`, không mock):

1. Server thật khởi động, in ra overlay URL kèm token thật.
2. Client thật bắt token từ log, kết nối `ws://.../overlay?token=...` — kết nối thành công.
3. MockProvider bắn event giả lập sau 5s → normalize → broadcast qua Socket.IO thật → client thật nhận đúng message:
   ```json
   {"sequence":1,"type":"liveEvent","data":{"type":"comment","user":{"username":"test_user"},"payload":{"text":"hello"},...}}
   ```

Đây là bằng chứng **toàn bộ chuỗi thật** (không phải unit test cô lập từng phần) đúng yêu cầu MILESTONES.md: "Fake Gift Event → Backend → WebSocket → Browser Overlay".

## Known limitations

1. **Chưa qua Rule Engine (M04)** — mọi `LiveEvent` hợp lệ được broadcast thẳng, không lọc theo automation nào cả. Đây là quyết định tường minh: Dashboard (M10) là nơi tạo automation thật; nối Rule Engine vào giờ sẽ cần fixture rule giả, không kiểm chứng thêm được gì so với test `rule-engine`/`action-engine` đã có riêng.
2. **Overlay app (`apps/overlay`) chưa được build/serve chung với `apps/server`** — hiện chạy độc lập qua `npm run dev --workspace=apps/overlay` (Vite dev server riêng cổng). Việc phục vụ file tĩnh qua chính Fastify server (hoặc dùng URL Vite dev riêng cho OBS Browser Source) sẽ quyết định cụ thể ở M10/M11 khi đóng gói production.
3. **`sound`/`tts` chưa được broadcast tới overlay** — `type: "liveEvent"` là loại message duy nhất đã nối; `soundReady`/`ttsReady` (đã có sẵn trong `OverlayMessage` schema) sẽ nối khi hoàn thiện M09 + liên kết với `onAudioReady`/`onSoundReady` của M06/M07.
4. Namespace `/dashboard` **chưa implement** — thuộc M09 (hoàn thiện overlay-gateway) + M10 (Dashboard UI).

## Next step

M09 — WebSocket (hoàn thiện `overlay-gateway`): namespace `/dashboard`, resync trạng thái khi reconnect, nối `onAudioReady`/`onSoundReady` từ TTS/Sound handler vào broadcast thật.
