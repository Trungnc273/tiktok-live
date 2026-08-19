# M07-REPORT.md — Sound

## Quyết định kiến trúc (đã dự đoán ở MILESTONES.md, xác nhận ở milestone này)

Phát audio **ở overlay browser** (qua WebSocket, sẽ nối ở M08/M09), **không phát ở server**. Lý do: né rủi ro thư viện phát audio native cross-platform trên máy dev Windows headless, và về bản chất loa để streamer nghe gắn với máy chạy OBS/trình duyệt overlay, không phải máy chạy backend Node.js. Trách nhiệm của M07 là: validate file cấu hình + giới hạn concurrency + gọi callback `onSoundReady` (điểm nối overlay-gateway sau này).

## Implemented

- `apps/server/src/modules/audio/`:
  - `validate-sound-file.ts` — `validateSoundFile()`: chỉ chấp nhận `.mp3`/`.wav`, chặn path traversal ra ngoài `soundsDir` cấu hình, kiểm tra file tồn tại thật (`fs.access`).
  - `concurrency-limiter.ts` — `ConcurrencyLimiter`: giới hạn số job chạy đồng thời (khác `TTSQueue` — sound được phép chạy song song tới ngưỡng, không tuần tự nghiêm ngặt).
  - `sound-action-handler.ts` — `createSoundActionHandler()`: `ActionHandler` cho `type: "sound"`, validate → giới hạn concurrency → gọi `onSoundReady`.

## Requirements đã đáp ứng (theo PHASE_9.md test list áp dụng cho action sound)

- File không tồn tại → action `failed`, thông báo rõ đường dẫn.
- Định dạng không hỗ trợ → action `failed`.
- Phát nhiều sound đồng thời có giới hạn → `ConcurrencyLimiter` (test xác nhận `peakConcurrent <= maxConcurrent` khi bắn 5 event song song).
- Path traversal bị chặn (bảo vệ thêm ngoài yêu cầu tối thiểu, hợp lý vì file cấu hình qua dashboard có thể bị gõ nhầm đường dẫn).

## Tests

**8 test mới** (`validate-sound-file.test.ts` 4, `sound-action-handler.test.ts` 4):

- Chấp nhận file hợp lệ, từ chối file không tồn tại, từ chối định dạng sai, chặn path traversal.
- Qua `ActionDispatcher` thật: phát đúng file → `onSoundReady` nhận đúng đường dẫn; file thiếu → failed không throw; định dạng sai → failed; giới hạn concurrency hoạt động đúng khi 5 event bắn đồng thời.

## Actual test result

```text
Test Files  11 passed (11)
     Tests  74 passed (74)   (66 từ M01-M06 + 8 từ M07)
```

`npm run typecheck` và `npm run build` sạch.

## Known limitations

- Chưa có `soundsDir` thật cấu hình cho production (chỉ có fixture trong test) — sẽ cấu hình qua biến môi trường hoặc dashboard settings ở M10/M11.
- Chưa nối vào `main.ts` — cùng lý do với M06 (chưa có overlay-gateway để `onSoundReady` phát ra đâu cả).

## Next step

M08 — Realtime Overlay: React overlay app + khung Socket.IO cơ bản. Đây là nơi `onAudioReady` (M06) và `onSoundReady` (M07) sẽ được nối thật — cả 2 milestone trước đó chỉ log ra console.
