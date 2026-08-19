# M11-REPORT.md — OBS Integration

## Implemented

- `apps/server/src/modules/obs/`:
  - `obs-service.ts` — `OBSService`: abstraction duy nhất che `obs-websocket-js` (dùng bản mã hoá **JSON tường minh** `obs-websocket-js/json` thay vì msgpack mặc định của Node build — dễ debug, khớp mock server dùng để test). `connect()`, `disconnect()`, `setCurrentScene()`, `isConnected()`.
  - `obs-scene-action-handler.ts` — `ActionHandler` cho `type: "obs.sceneChange"`, payload `{ sceneName }`.
  - `__tests__/mock-obs-server.ts` — mock OBS WebSocket v5 server (JSON, không auth) dùng `ws`, implement đúng phần protocol cần: Hello(0)/Identify(1)/Identified(2)/Request(6)/RequestResponse(7).
- Nối vào `main.ts`: **CHỈ đăng ký handler `obs.sceneChange` nếu có `OBS_WEBSOCKET_URL` trong env** (không đăng ký mù quáng cho 1 service chưa xác nhận kết nối được — xem Known limitations). Không kết nối được OBS lúc khởi động → log lỗi, **không chặn server chạy tiếp** (streamer có thể mở OBS sau).

## Module boundary đã đáp ứng

`Rule Engine`/`Action Engine` không import `obs-websocket-js` trực tiếp — chỉ biết `ActionHandler` interface chung (đúng `PHASE_12.md`: "Do not couple Rule Engine directly to OBS").

## Security

- `password` chỉ dùng tức thời trong `connect()`, **không gán vào field instance, không log** — xác nhận bằng đọc code trực tiếp (câu log duy nhất liên quan chỉ có `url`, không có `password`).
- Không commit credentials — `OBS_WEBSOCKET_URL`/`OBS_WEBSOCKET_PASSWORD` đọc từ biến môi trường.

## Tests

**8 test mới** (`obs-service.test.ts` 5, `obs-scene-action-handler.test.ts` 3), dùng **mocked OBS server thật** (kết nối WebSocket thật, không mock `obs-websocket-js`):

- Kết nối thành công, `setCurrentScene` gửi đúng request, gọi trước khi connect → lỗi rõ ràng, OBS trả lỗi request → reject đúng, disconnect rồi gọi lại → lỗi thay vì treo.
- Qua `ActionDispatcher` thật: đổi scene thành công, payload thiếu `sceneName` → failed không throw, OBS chưa kết nối → failed rõ ràng không làm crash dispatcher.

## Actual test result

```text
apps/server: Test Files 18 passed (18) | Tests 104 passed (104)   (96 từ M01-M10 + 8 từ M11)
```

`npm run typecheck` và `npm run build` sạch.

## Sự cố phát hiện và xử lý trong lúc code

`obs-websocket-js` mặc định (import ESM không chỉ định) dùng **msgpack encoding** trên Node.js (theo tài liệu package, không phải giả định) — mock server JSON ban đầu khiến `connect()` treo vô thời hạn (timeout test, không phải deadlock code của tôi). Xác nhận qua đọc `package.json` `exports` field của package. Sửa bằng cách import tường minh `obs-websocket-js/json` để khớp encoding với mock server — quyết định hợp lý vì JSON dễ debug hơn msgpack cho 1 dự án MVP.

## Known limitations — QUAN TRỌNG, không giả vờ đã verify

**Máy dev hiện tại KHÔNG cài OBS Studio thật** (đã kiểm tra: không có process `obs64`/`obs32` chạy, không có file cài đặt ở đường dẫn mặc định). Vì vậy:

- ✅ Đã test với **mocked OBS server** (đúng yêu cầu tối thiểu của `PHASE_12.md`).
- ❌ **CHƯA** test với OBS Studio thật (`PHASE_12.md` cũng yêu cầu "test thủ công với OBS thật ít nhất 1 lần" — không thực hiện được trong môi trường này, không giả vờ đã làm).

Để verify với OBS thật, người dùng cần: cài OBS Studio (từ OBS 28 trở lên có sẵn plugin `obs-websocket`), bật WebSocket Server trong Tools → WebSocket Server Settings, đặt `OBS_WEBSOCKET_URL=ws://127.0.0.1:4455` (+ `OBS_WEBSOCKET_PASSWORD` nếu có) trong `.env`, chạy server và tạo 1 automation `type: "obs.sceneChange"` để tự kiểm tra.

## Ghi chú triển khai Linux/VPS (câu hỏi người dùng đặt ra trong lúc làm milestone này)

`OBSService`/`obs-websocket-js` hoàn toàn cross-platform (WebSocket thuần), không có vấn đề gì khi deploy Linux VPS. Vấn đề cross-platform duy nhất của dự án nằm ở `WindowsSapiProvider` (M06, TTS) — không liên quan tới M11.

## Next step

M12 — End-to-End Testing: chạy đủ 6 scenario theo `PHASE_13.md`, ghi kết quả thật vào `docs/testing/TEST-REPORT.md`.
