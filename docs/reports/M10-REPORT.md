# M10-REPORT.md — Automation Dashboard

## Implemented

### Backend — mở rộng REST API + nối pipeline đầy đủ
- `packages/shared-types/src/field-whitelist.ts` — chuyển `FIELD_WHITELIST` từ `apps/server` sang dùng chung (dashboard cần biết field hợp lệ theo từng eventType cho Automation Builder). `apps/server/src/modules/rule-engine/field-whitelist.ts` giờ chỉ re-export, tránh 2 nơi định nghĩa lệch nhau.
- `persistence/automations-repository.ts` — CRUD đầy đủ (`list/get/create/update/delete/duplicate`) trên bảng `automations` (đã có từ M03).
- `persistence/events-repository.ts` — thêm `getRecent(limit)`.
- `api/status-tracker.ts` — `StatusTracker`: đếm follow/like/comment/share/gift + viewerCount + connectionState, in-memory.
- `api/http-server.ts` — thêm route: `GET/POST /api/automations`, `PUT/DELETE /api/automations/:id`, `POST /api/automations/:id/duplicate`, `GET /api/status`, `GET /api/events/recent`. Validate body bằng Zod + `validateRule()` (M04) — reject rule tham chiếu field ngoài whitelist ngay lúc tạo.
- **`main.ts` nối đầy đủ pipeline tự động** (điều mà M08/M09 report ghi là "known limitation"): mỗi `LiveEvent` → đọc `automations` thật từ DB → `evaluateRules()` (M04) → `ActionDispatcher` (M05) → TTS/Sound handler (M06/M07) → broadcast qua `OverlayGateway` (M08/M09).

### Frontend — `apps/dashboard` (React + Vite, app mới)
- `api-client.ts` — client gọi REST API.
- `automation-builder-logic.ts` — hàm thuần `buildAutomationInput()`/`validateBuilderState()`, tách khỏi DOM để test độc lập.
- `AutomationBuilder.tsx` — form WHEN (trigger)/IF (điều kiện đơn, tuỳ chọn)/THEN (nhiều action TTS/Sound) — **không cần viết JSON/code tay**, đúng yêu cầu PRD.
- `AutomationsList.tsx` — list/enable-disable/delete/duplicate.
- `StatusBar.tsx` — hiển thị trạng thái kết nối/viewer/counts.
- `App.tsx` — kết nối namespace `/dashboard` (Socket.IO, M09) để cập nhật status realtime thay vì polling.

## Quyết định UX (đúng PHASE 11 — "Simplicity > đầy đủ tính năng")

Automation Builder chỉ hỗ trợ **1 điều kiện đơn** (không có UI cây AND/OR lồng nhau) dù Rule Engine (M04) hỗ trợ đầy đủ. Đây là quyết định tường minh ưu tiên đơn giản cho non-programmer streamer; UI cây điều kiện phức tạp hơn để dành Phase 2 nếu cần.

## Tests

**23 test mới**: `status-tracker.test.ts` (4), `automations-api.integration.test.ts` (8, Postgres thật — bao gồm reject field ngoài whitelist), `automation-builder-logic.test.ts` (5), `AutomationBuilder.test.tsx` (2), `AutomationsList.test.tsx` (3).

Test quan trọng nhất — khớp nguyên văn acceptance criteria PRD:

> "Người dùng không biết code tạo được rule `Gift Rose → TTS + Animation` chỉ qua giao diện, không cần viết JSON/code tay"

→ `AutomationBuilder.test.tsx`: giả lập người dùng gõ tên, chọn trigger "gift" từ dropdown, bật điều kiện, chọn field/operator từ dropdown + gõ giá trị "Rose", bấm "+ Sound"/"+ TTS" thêm 2 action, bấm submit — xác nhận `onCreate` nhận đúng payload JSON hoàn chỉnh, **người dùng không gõ 1 ký tự JSON nào**.

## Actual test result

```text
apps/server:    Test Files 16 passed (16) | Tests 96 passed (96)   (84 từ M01-M09 + ~12 mới thuộc backend M10)
apps/dashboard: Test Files 3 passed (3)   | Tests 10 passed (10)   (toàn bộ mới)
```

`npm run typecheck` và `npm run build` sạch cho cả `apps/server` và `apps/dashboard` (Vite build thật).

## Verification full-stack thật (không chỉ test tự động)

Chạy `apps/server` thật (Postgres thật, `WindowsSapiProvider` thật — không mock) + script Node gọi thẳng REST API như 1 client thật:

1. `POST /api/automations` tạo rule `comment → TTS` — trả `201`.
2. MockProvider (TikTok) bắn event `comment` giả lập mỗi 5s (dev fallback khi không có `TIKTOK_USERNAME`).
3. Pipeline thật tự động: normalize → Rule Engine khớp rule vừa tạo → Action Engine dispatch → **Windows SAPI thật tổng hợp audio thật**.
4. **Xác nhận bằng 2 nguồn độc lập**: (a) query trực tiếp bảng `execution_logs` trong Postgres thấy nhiều dòng `status='success'` đúng `automation_id` vừa tạo qua API; (b) thư mục `.media/` chứa nhiều file `.wav` thật, mỗi file ~142KB (không phải file rỗng).

Đây là bằng chứng automation **tạo qua REST API thật** (con đường mà dashboard UI sẽ gọi) chạy được toàn bộ chuỗi thật tới tận audio output — không phải chỉ unit test cô lập từng phần.

## Known limitations

1. **Chưa có browser E2E thật** (Playwright/Cypress điều khiển browser thật click vào dashboard UI) — component test (`@testing-library/react` + `userEvent`, giả lập DOM qua jsdom) đã xác nhận đúng logic UI, nhưng chưa chạy trong browser thật. Đây chính xác là phạm vi của **M12 (E2E Testing)**, không lặp lại ở đây.
2. `automationsRepository.list()` được gọi lại **mỗi khi có 1 event mới** (không cache in-memory) — chấp nhận được cho MVP 1 streamer, đã ghi chú trong code là điểm cần tối ưu nếu volume cao (Phase 2).
3. Dashboard chưa hiển thị lịch sử thực thi rule (`execution_logs`) — không nằm trong yêu cầu tối thiểu M10 (PRD FR-27 "Lịch sử thực thi rule" là Phase 2).
4. `apps/dashboard` chưa được deploy/serve chung với `apps/server` — chạy qua `npm run dev --workspace=apps/dashboard` (Vite dev server riêng, có proxy `/api` và `/socket.io` sang `apps/server`).

## Next step

M11 — OBS Integration: `OBSService` qua OBS WebSocket API, action `type: "obs.sceneChange"`, chỉ làm sau khi core automation (đã hoàn thành ở M10) ổn định — đúng như `PHASE_12.md` yêu cầu.
