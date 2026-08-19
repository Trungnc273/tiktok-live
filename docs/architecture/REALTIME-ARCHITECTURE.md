# REALTIME-ARCHITECTURE.md

## WebSocket architecture

Một cổng duy nhất ra bên ngoài: `overlay-gateway` (Socket.IO server), phục vụ 2 loại client:

```text
event-bus / action-engine
        ↓
  overlay-gateway (Socket.IO namespace/room)
   ├── /overlay  → OBS Browser Source client (token theo overlay instance)
   └── /dashboard → Dashboard React app (token/local trust)
```

- **Namespace `/overlay`**: mỗi overlay instance có 1 token sinh khi tạo URL trong dashboard (ví dụ `https://host/overlay?token=...`). Server xác thực token khi client connect; token sai → reject connection, không có channel công khai không token (Security, xem SYSTEM-ARCHITECTURE.md).
- **Namespace `/dashboard`**: nhận toàn bộ `LiveEvent` thô (để hiển thị realtime feed) + trạng thái kết nối TikTok + trạng thái automation. MVP chạy local/self-hosted nên tin tưởng theo local network; nếu deploy VPS công khai, bắt buộc bật token tương tự `/overlay` (ghi rõ như một yêu cầu vận hành, không phải optional).

## Reconnect / heartbeat

- Dùng cơ chế reconnect + heartbeat có sẵn của Socket.IO (client tự động reconnect với backoff, server ping/pong định kỳ) thay vì tự viết lại — đúng tinh thần "không over-engineer" của PHASE 03.
- Khi overlay reconnect sau khi mất kết nối, server gửi lại **trạng thái hiện tại** (không replay toàn bộ event đã bỏ lỡ ở MVP — chỉ đảm bảo overlay không bị treo ở trạng thái cũ). Replay đầy đủ event miss trong lúc mất kết nối là Phase 2 nếu cần.

## Event ordering & duplicate protection

- Mỗi message gửi qua `overlay-gateway` mang `sequence` tăng dần theo `stream_session` (không chỉ dựa vào thời gian nhận, vì network có thể làm lệch thứ tự tới overlay).
- Overlay client giữ `lastSequenceHandled`; message có `sequence <= lastSequenceHandled` bị bỏ qua (duplicate protection khi Socket.IO tự động resend sau reconnect).

## Graceful fallback

- Nếu `overlay-gateway` không thể phát WebSocket (ví dụ lỗi tạm thời), action vẫn ghi vào `execution_logs` với status phù hợp — không để lỗi overlay làm rule engine/action engine crash (NFR-4, khớp SYSTEM-ARCHITECTURE.md).
- Overlay client hiển thị trạng thái "mất kết nối" thay vì đứng hình im lặng, để streamer biết cần refresh nguồn OBS.

## Queue architecture (Action Engine / TTS)

```text
Action Engine nhận batch Action[] từ Rule Engine
 ↓
Mỗi Action được đẩy vào queue theo loại:
 ├── ttsQueue     (tuần tự, tránh chồng tiếng nói — xem PHASE 09)
 ├── soundQueue   (có thể chạy song song giới hạn N luồng)
 └── overlayQueue (gần như tức thời, không cần hàng đợi nghiêm ngặt)
```

- **Triển khai MVP**: queue in-memory (interface `Queue<T>` trừu tượng — `enqueue`, `onProcess`, `size`), chạy trong cùng process backend. Lý do và điều kiện nâng cấp lên Redis/BullMQ đã nêu ở `SYSTEM-ARCHITECTURE.md`.
- **ttsQueue** xử lý tuần tự (1 job tại 1 thời điểm) để tránh 2 câu TTS đọc chồng lên nhau, trừ khi cấu hình cho phép overlap (đúng yêu cầu PHASE 09 "Prevent overlapping speech unless explicitly configured").
- Rate limiting theo `SYSTEM-ARCHITECTURE.md` (drop có chọn lọc khi vượt ngưỡng) áp dụng tại điểm `enqueue`, không áp dụng sau khi job đã vào queue (tránh vừa xếp hàng vừa drop giữa chừng gây khó debug).

## Giới hạn đã biết (MVP)

- Queue in-memory **mất khi process crash/restart** — job đang chờ xử lý (ví dụ TTS chưa đọc) sẽ mất, không tự động phục hồi. Chấp nhận được ở MVP (1 streamer, tự vận hành, có thể tự nhận biết và xử lý thủ công); nếu không chấp nhận được khi thực tế vận hành, đây là tín hiệu nâng cấp Redis/BullMQ (Phase 2).
