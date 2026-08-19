# M01-REPORT.md — TikTok LIVE Event Receiver

## Implemented

- Monorepo khởi tạo: npm workspaces (`apps/*`, `packages/*`), git repo init.
- `packages/shared-types`: Zod schema `LiveEvent` (discriminated union theo `EVENT-MODEL.md`) — dùng ở M02, tạo trước để có type dùng chung ngay từ đầu.
- `apps/server/src/modules/tiktok-adapter/`:
  - `types.ts` — `AdapterEvent` (envelope trung lập, không lộ object của thư viện), `ConnectionState`, `LiveProvider` interface.
  - `connection-manager.ts` — state machine (`idle → connecting → connected`, `reconnecting`, `error`, `disconnected`), reconnect với exponential backoff + jitter, giới hạn `maxReconnectAttempts`, graceful shutdown (`stop()`).
  - `providers/mock-provider.ts` — provider giả lập cho test + dev không có phòng live thật.
  - `providers/tiktok-live-connector-provider.ts` — provider thật, wrap `tiktok-live-connector@2.4.4`, chỉ forward 7 event đã xác nhận cần cho MVP (CHAT, GIFT, LIKE, FOLLOW, SHARE, MEMBER, ROOM_USER).
  - `index.ts` — export công khai của module (điểm truy cập duy nhất từ bên ngoài).
- `apps/server/src/main.ts` — entrypoint dev, tự chọn MockProvider hoặc provider thật dựa trên `TIKTOK_USERNAME` trong env, có graceful shutdown qua SIGINT/SIGTERM.
- `apps/server/src/config/logger.ts` — structured JSON logging (pino), không dùng pino-pretty để tránh dependency chưa cần thiết.

## Files changed

Toàn bộ file mới, chưa có file cũ để sửa (dự án khởi tạo từ đầu). Danh sách đầy đủ nằm trong git (`git status`), gồm: `package.json`, `.gitignore`, `packages/shared-types/**`, `apps/server/**` (trừ `node_modules`, `dist`).

## Dependency added

- `tiktok-live-connector@2.4.4` (unofficial, đã xác nhận rủi ro ở PHASE 01).
- `uuid@9.0.1`, `pino@9`, `zod@3.23.8`.
- Dev: `typescript@5.9.3`, `tsx@4`, `vitest@2`, `@types/node@22`.

## Tests

6 test trong `connection-manager.test.ts`, chạy qua `npm run test --workspace=apps/server`:

1. Kết nối thành công, đúng thứ tự state `idle → connecting → connected`.
2. Forward đúng mock event qua `AdapterEvent`.
3. Lỗi kết nối lần đầu → emit lỗi + tự chuyển `reconnecting` → reconnect thành công.
4. Mất kết nối đột ngột (`simulateUnexpectedDisconnect`) → tự reconnect.
5. Vượt `maxReconnectAttempts` → chuyển hẳn sang `error`, ngừng tự retry.
6. `stop()` → hủy timer reconnect đang chờ, ngắt kết nối, chuyển `disconnected`.

## Actual test result

```text
Test Files  1 passed (1)
     Tests  6 passed (6)
```

Đã chạy thật (`npm run test --workspace=apps/server`), không giả định kết quả. Đồng thời `npm run typecheck` và `npm run build` (cả 2 đều dùng `tsc`) chạy sạch, không lỗi.

## Live test result

**Chưa test với phòng LIVE TikTok thật.** Lý do: cần (a) một tài khoản TikTok đang live thật tại thời điểm test, và (b) `EULER_STREAM_API_KEY` (Euler Stream) hợp lệ — cả hai chưa có trong phiên làm việc này. Đây là giới hạn đã được `docs/implementation/MILESTONES.md` lường trước ("nếu không có phòng live thật để test... phải nêu rõ trong report, không được suy đoán").

Thay vào đó đã verify bằng cách chạy `apps/server` thật (không phải test tự động) với `MockProvider`, quan sát log JSON thật:

```json
{"state":"connecting"}
{"state":"connected"}
{"event":{"name":"chat","data":{"comment":"hello","user":{"uniqueId":"test_user"}}}}
```

→ Chứng minh `ConnectionManager` + pipeline logging hoạt động đúng logic thật (không phải chỉ đúng trong unit test cô lập). **Không** chứng minh `TikTokLiveConnectorProvider` (code kết nối thật) hoạt động với TikTok thật — phần đó chỉ được typecheck sạch, chưa chạy.

## Known limitations

1. **Chưa xác nhận `TikTokLiveConnectorProvider` hoạt động với TikTok LIVE thật** — cần `TIKTOK_USERNAME` (1 streamer đang live thật) + `EULER_STREAM_API_KEY` để test. Đây là việc bắt buộc phải làm trước khi tuyên bố M01 "production ready", dù về mã nguồn đã hoàn chỉnh theo tài liệu API của thư viện.
2. Phát hiện lỗi thật trong lúc code (đã sửa, không phải giả thuyết): `EventEmitter` của Node coi `"error"` là tên sự kiện đặc biệt — nếu emit mà không có listener, nó **throw** thay vì bỏ qua. Đã đổi tên sự kiện nội bộ từ `"error"` sang `"connectionError"` để tránh crash ngoài ý muốn khi có consumer quên đăng ký listener.
3. Phát hiện vấn đề trong `.d.ts` được publish bởi `tiktok-live-connector@2.4.4`: kiểu `TikTokLiveConnection` không expose đúng phương thức `on` kế thừa từ `TypedEventEmitter` (xác nhận bằng repro tối giản độc lập, không phải lỗi ở code của dự án). Đã xử lý bằng 1 interface hẹp `EventEmittingConnection` + cast tường minh, có ghi chú rõ lý do trong code — không dùng `any` tràn lan.
4. `uuid@9.0.1` đang bị npm cảnh báo deprecated (không phải lỗi chức năng) — cân nhắc nâng lên `uuid@11` ở milestone sau nếu cần, chưa cấp thiết cho M01 (M01 chưa thực sự dùng `uuid` — sẽ dùng ở M02 khi sinh `LiveEvent.id`).

## Next step

M02 — Event Normalization: chuyển `AdapterEvent` (raw, tên event dạng string) thành `LiveEvent` chuẩn hoá theo `EVENT-MODEL.md`, dựa trên cấu trúc payload thật của `tiktok-live-connector` (WebcastChatMessage, WebcastGiftMessage, WebcastLikeMessage, WebcastSocialMessage, WebcastMemberMessage, WebcastRoomUserSeqMessage) đã xác nhận qua `.d.ts` của thư viện ở M01.

---

Không giả vờ thành công ở phần chưa kiểm chứng (live test thật). M01 hoàn thành ở mức: code đầy đủ, test tự động pass, build/typecheck sạch, pipeline chạy thật với mock — nhưng **chưa** có bằng chứng thật với TikTok LIVE.
