# M09-REPORT.md — WebSocket (hoàn thiện overlay-gateway)

## Implemented

### Backend
- `overlay-gateway/gateway.ts` mở rộng:
  - Namespace `/dashboard` (song song `/overlay`) — MVP **không bắt buộc token** (tin tưởng local network theo đúng `REALTIME-ARCHITECTURE.md`), ghi rõ trong code đây là việc **bắt buộc phải bật** trước khi deploy VPS công khai, chưa làm vì Dashboard UI (M10) chưa tồn tại.
  - Resync khi (re)connect: server emit `sync` kèm `sequence` hiện tại ngay khi client connect vào cả 2 namespace.
  - `broadcast()` giờ phát tới cả `/overlay` lẫn `/dashboard`.
- `api/http-server.ts` mở rộng: phục vụ tĩnh `mediaDir` (`/media/*` — audio TTS sinh ra) và `soundsDir` (`/sounds/*` — file sound cấu hình sẵn) qua `@fastify/static`.
- `tts/tts-action-handler.ts`: thêm option `outputDir` (mặc định OS tmpdir) để ghi file vào thư mục được Fastify phục vụ tĩnh thay vì tmpdir không truy cập được qua HTTP.

### Frontend (`apps/overlay`)
- `sequence-guard.ts`: thêm `fastForwardTo()` xử lý `sync` event từ server.
- `App.tsx`: lắng nghe `sync` (resync sequence), lắng nghe `soundReady`/`ttsReady` (phát audio thật qua `new Audio(url).play()`).

## Yêu cầu đã đáp ứng (RULE `overlay-gateway`/`REALTIME-ARCHITECTURE.md`)

- Event ordering / duplicate protection — kế thừa từ M08 (`SequenceGuard`), hoàn thiện thêm resync.
- Graceful fallback — action lỗi/DB lỗi không chặn broadcast (kế thừa NFR-4 từ M03-M05).
- **Nối TTS (M06) + Sound (M07) → overlay thật** — đây là phần còn thiếu từ M06/M07, hoàn thành ở milestone này.

## Tests

**2 test integration mới** (`tts-sound-to-overlay.integration.test.ts`), dựng **toàn bộ chuỗi thật, không mock namespace/HTTP**:

1. `ActionDispatcher` chạy TTS handler thật (MockTTSProvider để nhanh + xác định) → `onAudioReady` → `gateway.broadcast("ttsReady", {url})` → client Socket.IO thật nhận message → `fetch(url)` thật qua HTTP → xác nhận đúng 44 byte WAV header thật được phục vụ (không phải 404).
2. Tương tự cho Sound handler → `soundReady` → fetch file `rose.mp3` fixture thật → xác nhận đúng nội dung.

## Actual test result

```text
apps/server:   Test Files 14 passed (14) | Tests 84 passed (84)   (82 từ M01-M08 + 2 integration mới)
apps/overlay:  Test Files 3 passed (3)   | Tests 9 passed (9)     (không đổi, xác nhận không hồi quy sau khi sửa SequenceGuard)
```

`npm run typecheck` và `npm run build` sạch cho cả 2 app (Vite build thật thành công, không chỉ typecheck).

## Known limitations

1. `/dashboard` namespace mới có khung kết nối (connect/sync/broadcast) — **chưa có UI dashboard nào tiêu thụ nó** (thuộc M10).
2. Token cho `/dashboard` chưa bắt buộc — chấp nhận được cho MVP self-hosted local, **phải bổ sung trước khi deploy công khai** (đã ghi rõ trong code, không phải thiếu sót bị bỏ quên).
3. `main.ts` (pipeline chạy thật) **vẫn chưa nối** Rule Engine → Action Engine → TTS/Sound → overlay thành 1 chuỗi tự động hoàn chỉnh — hiện chỉ broadcast raw `LiveEvent`. Việc nối đầy đủ cố ý để tới M10 khi Dashboard cho phép streamer tạo automation thật (không có ý nghĩa nối cứng rule giả vào `main.ts` trước khi có nơi cấu hình rule).

## Next step

M10 — Automation Dashboard: React app quản lý automation (CRUD qua REST API mở rộng từ `apps/server/src/modules/api/`), và đây là lúc nối đầy đủ Rule Engine (M04) → Action Engine (M05) → TTS/Sound (M06/M07) → OverlayGateway (M08/M09) thành pipeline tự động hoàn chỉnh trong `main.ts`.
