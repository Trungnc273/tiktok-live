# MILESTONES.md

Chi tiết từng milestone M01→M13. Tham chiếu: `docs/architecture/*`, `docs/product/PRD.md`.

---

## M01 — TikTok LIVE connection

- **Objective**: Kết nối tới 1 phòng LIVE TikTok thật qua TikTok-Live-Connector, cô lập trong `tiktok-adapter`, phát raw event ra ngoài qua interface nội bộ.
- **Files/modules**: `apps/server/src/modules/tiktok-adapter/` (connection manager, reconnect logic, connection state, event listener, mock provider).
- **Dependencies**: `tiktok-live-connector` (npm), key Euler Stream (biến môi trường).
- **Database changes**: Không.
- **API changes**: Không (chưa có REST API ở milestone này, chỉ nội bộ).
- **Tests**: unit test connection manager, mock event test, connection failure test, reconnection test (mock provider khi không có phòng live thật để test liên tục).
- **Acceptance criteria**: `npm run dev` (trong `apps/server`) kết nối được tới 1 username TikTok đang live thật (do người vận hành cung cấp) và log ra event nhận được; nếu không có phòng live thật để test tại thời điểm code, phải nêu rõ trong report và cung cấp bằng chứng test qua mock, không được suy đoán "chắc sẽ chạy".
- **Risks**: Rủi ro nền tảng đã biết (PHASE 01) — thư viện có thể không hoạt động ngay do thay đổi phía TikTok, không phải lỗi code.
- **Verification method**: chạy thật + log output + test tự động (`npm test`).

## M02 — Event normalization

- **Objective**: Implement `event-normalizer` theo `EVENT-MODEL.md`, chuyển raw event của thư viện thành `LiveEvent`.
- **Files/modules**: `apps/server/src/modules/event-normalizer/`, `packages/shared-types` (Zod schema LiveEvent).
- **Dependencies**: Zod.
- **Database changes**: Không.
- **API changes**: Không.
- **Tests**: unit test mapping cho từng event type (follow/like/comment/share/gift/join), unknown event handling, validation reject event thiếu field.
- **Acceptance criteria**: Mọi raw event từ M01 (thật hoặc mock) được chuyển thành `LiveEvent` hợp lệ theo schema, event lạ → `UnknownEvent` không throw.
- **Risks**: Field thực tế thư viện trả về có thể khác tài liệu cộng đồng — cần map dựa trên dữ liệu thật quan sát được ở M01, không suy đoán từ README.
- **Verification method**: unit test + log LiveEvent thật từ 1 phiên kết nối thử.

## M03 — Event storage/logging

- **Objective**: Lưu `LiveEvent` vào bảng `events_log` (Postgres) theo `DATABASE-DESIGN.md`.
- **Files/modules**: `apps/server/src/modules/persistence/` (repository), migration tạo bảng `stream_sessions`, `events_log`.
- **Dependencies**: Postgres client/ORM (chốt cụ thể tại lúc code, ví dụ Drizzle), Postgres instance (Docker Compose cho dev).
- **Database changes**: Tạo `stream_sessions`, `events_log`.
- **API changes**: Không.
- **Tests**: integration test ghi/đọc events_log, test khi DB không khả dụng (không được làm crash pipeline chính — log lỗi, tiếp tục).
- **Acceptance criteria**: Mỗi `LiveEvent` phát ra từ M02 được ghi vào DB đúng schema; mất kết nối DB tạm thời không làm dừng nhận event từ TikTok.
- **Risks**: Ghi log đồng bộ có thể làm chậm pipeline chính nếu DB chậm — cần ghi bất đồng bộ (fire-and-forget có log lỗi), không block event-bus.
- **Verification method**: integration test + kiểm tra dữ liệu thật trong DB sau 1 phiên test.

## M04 — Rule engine

- **Objective**: Implement Rule Engine theo `RULE-ENGINE.md`: match trigger, evaluate conditions, dispatch actions.
- **Files/modules**: `apps/server/src/modules/rule-engine/`.
- **Dependencies**: Không thêm mới đáng kể (dùng lại Zod).
- **Database changes**: Tạo bảng `automations` (đọc rule từ DB, hoặc từ in-memory config nếu API/dashboard CRUD chưa xong — cần seed/test rule qua fixture ở milestone này).
- **API changes**: Không bắt buộc ở milestone này (CRUD automation thật sự thuộc M10, ở đây chỉ cần đọc rule để test rule engine).
- **Tests**: đầy đủ theo danh sách trong `RULE-ENGINE.md` (trigger match/mismatch, từng condition operator, AND/OR lồng nhau, multiple rules, priority, disabled rule, invalid rule, action ordering).
- **Acceptance criteria**: Với rule fixture + LiveEvent fixture, output đúng danh sách Action[] theo thứ tự kỳ vọng.
- **Risks**: Whitelist field theo eventType (đề cập ở RULE-ENGINE.md) cần đồng bộ chặt với schema M02 — dễ lệch nếu 2 module phát triển tách rời, cần test tích hợp chung.
- **Verification method**: unit test coverage cao cho toàn bộ nhánh logic điều kiện.

## M05 — Action engine

- **Objective**: Implement Action Dispatcher + Action Handler interface theo `SYSTEM-ARCHITECTURE.md`.
- **Files/modules**: `apps/server/src/modules/action-engine/` (dispatcher, handler registry, execution log writer).
- **Dependencies**: Không thêm mới.
- **Database changes**: Tạo bảng `execution_logs`.
- **API changes**: Không.
- **Tests**: success/failure/timeout/retry/idempotency (theo đúng yêu cầu PHASE 08), 1 action lỗi không chặn action khác.
- **Acceptance criteria**: Nhận `Action[]` từ M04, thực thi tuần tự qua handler tương ứng (ở milestone này handler có thể là stub/no-op cho tới khi M06-M08 implement thật), ghi `execution_logs` đầy đủ.
- **Risks**: Handler chưa tồn tại (TTS/Sound/Overlay) ở thời điểm này — cần registry cho phép đăng ký handler sau, không hard-code danh sách handler cố định.
- **Verification method**: unit test với handler giả lập (mock handler thành công/thất bại/timeout).

## M06 — TTS

- **Objective**: Implement TTS provider abstraction + queue theo `PHASE_9.md`/`REALTIME-ARCHITECTURE.md`.
- **Files/modules**: `apps/server/src/modules/tts/` (`TTSProvider` interface, 1 provider thật + `MockProvider`, `ttsQueue`).
- **Dependencies**: SDK của TTS provider được chọn (**chưa chốt — quyết định thực tế tại lúc code milestone này**, ứng viên: Edge TTS miễn phí/local, hoặc provider trả phí có API — cần cân nhắc chi phí/độ trễ thật sự lúc implement, không quyết định trước trong tài liệu kiến trúc).
- **Database changes**: Không (trừ khi cần bảng cấu hình provider — quyết định lúc code).
- **API changes**: Không bắt buộc milestone này.
- **Tests**: template replacement (`{username}`...), sanitize input (chống injection), provider failure, hàng đợi tuần tự (không chồng tiếng), concurrent events, rate limiting.
- **Acceptance criteria**: Action `type: "tts"` phát ra audio thật (hoặc qua MockProvider trong CI) đọc đúng template đã thay biến.
- **Risks**: Chi phí/độ trễ provider thật chưa đo — cần đo thực tế trước khi chốt provider chính thức cho MVP.
- **Verification method**: test tự động (MockProvider) + nghe thử thật ít nhất 1 lần với provider thật.

## M07 — Sound

- **Objective**: Audio playback (mp3/wav) cho action `type: "sound"`.
- **Files/modules**: `apps/server/src/modules/audio/`.
- **Dependencies**: Thư viện phát audio phía server hoặc phát qua overlay client (quyết định kiến trúc nhỏ tại lúc code: phát audio ở overlay browser thường thực tế hơn phát ở server headless — **cần quyết định cụ thể ở milestone này**, khả năng cao là "gửi lệnh phát qua WebSocket, overlay browser tự phát" để tận dụng loa của máy chạy OBS).
- **Database changes**: Không.
- **API changes**: Không.
- **Tests**: xử lý file không tồn tại, định dạng không hỗ trợ, phát nhiều sound đồng thời có giới hạn.
- **Acceptance criteria**: Action `type: "sound"` phát đúng file cấu hình.
- **Risks**: Nếu chọn phát ở server thay vì overlay, cần thư viện native phát audio → thêm rủi ro cross-platform (Windows dev machine hiện tại của người vận hành). Ưu tiên phương án phát qua overlay browser để né rủi ro này.
- **Verification method**: nghe thử thật qua overlay demo.

## M08 — Overlay

- **Objective**: React overlay app + khung Socket.IO server cơ bản (connect/token/heartbeat), hiển thị follow/gift/comment alert, custom text, trigger sound/animation.
- **Files/modules**: `apps/overlay/`, `apps/server/src/modules/overlay-gateway/` (khung cơ bản).
- **Dependencies**: Socket.IO (client + server), React, Vite.
- **Database changes**: Không.
- **API changes**: Endpoint tạo overlay URL + token (thuộc `apps/server/src/modules/api/`).
- **Tests**: component test hiển thị đúng theo event nhận được, test reconnect cơ bản.
- **Acceptance criteria**: Fake Gift Event → backend → WebSocket → browser overlay → hiện animation (đúng chuỗi verification PHASE 10).
- **Risks**: Animation phức tạp có thể tốn thời gian — MVP chỉ cần animation cơ bản (fade/slide), không cần hiệu ứng phức tạp.
- **Verification method**: test thủ công bằng cách bắn fake event, xem overlay trong trình duyệt.

## M09 — WebSocket (hoàn thiện overlay-gateway)

- **Objective**: Hoàn thiện `overlay-gateway` đầy đủ theo `REALTIME-ARCHITECTURE.md`: sequence/dedup, resync trạng thái khi reconnect, namespace `/dashboard`.
- **Files/modules**: `apps/server/src/modules/overlay-gateway/` (hoàn thiện, không tạo mới toàn bộ vì khung đã có từ M08).
- **Dependencies**: Không thêm mới.
- **Database changes**: Không.
- **API changes**: Không (mở rộng nội bộ).
- **Tests**: event ordering, duplicate protection, graceful fallback khi gateway lỗi.
- **Acceptance criteria**: Overlay/dashboard reconnect sau khi mất mạng tạm thời không bị kẹt ở trạng thái cũ, không nhận trùng message.
- **Risks**: Không đáng kể, chủ yếu là hoàn thiện.
- **Verification method**: test thủ công ngắt/nối lại mạng trong lúc chạy demo.

## M10 — Dashboard

- **Objective**: React dashboard: màn hình Dashboard (status/viewer/like/comment/gift realtime), Automations (list/create/edit/enable-disable/delete/duplicate), Automation Builder (form WHEN/IF/THEN không cần biết code).
- **Files/modules**: `apps/dashboard/`, `apps/server/src/modules/api/` (REST CRUD automations, đọc events_log gần nhất).
- **Dependencies**: React, Vite, thư viện form (quyết định lúc code).
- **Database changes**: Không (dùng bảng đã có).
- **API changes**: `GET/POST/PUT/DELETE /api/automations`, `GET /api/events/recent`, `GET /api/status`.
- **Tests**: component test, API test, 1 E2E test tạo automation `Gift Rose → TTS + Animation` không viết code tay (đúng acceptance criteria PRD).
- **Acceptance criteria**: Người dùng không biết code tạo được rule ví dụ trên chỉ qua UI.
- **Risks**: UX phức tạp hoá nếu cố nhét hết toán tử điều kiện vào 1 form — cần ưu tiên đơn giản/tốc độ theo đúng PHASE 11 (Simplicity > đầy đủ tính năng).
- **Verification method**: E2E test + tự thao tác thử trên UI thật.

## M11 — OBS integration

- **Objective**: `OBSService` qua OBS WebSocket API, action `type: "obs.sceneChange"` (và show/hide source nếu khả thi).
- **Files/modules**: `apps/server/src/modules/obs/`.
- **Dependencies**: `obs-websocket-js` (hoặc tương đương, xác nhận version/API hiện hành tại lúc code — OBS WebSocket đổi version theo thời gian, phải kiểm tra tài liệu hiện hành, không giả định API cũ còn đúng).
- **Database changes**: Bảng cấu hình kết nối OBS (host/port, password mã hoá) — chi tiết tại lúc code.
- **API changes**: Endpoint cấu hình kết nối OBS trong dashboard.
- **Tests**: dùng mocked OBS server (đúng yêu cầu PHASE 12), không phụ thuộc OBS thật chạy trong CI.
- **Acceptance criteria**: Rule Engine không phụ thuộc trực tiếp OBS (chỉ qua Action Engine → OBSService); đổi scene thật thành công khi có OBS thật chạy cùng máy.
- **Risks**: OBS password không được commit/log — bắt buộc theo `SYSTEM-ARCHITECTURE.md` Security.
- **Verification method**: test với mocked server (CI) + test thủ công với OBS thật ít nhất 1 lần.

## M12 — Testing (E2E toàn hệ thống)

- **Objective**: Chạy đủ 6 scenario theo `PHASE_13.md` (Follow→Rule→TTS; Gift Rose→Rule→Sound→TTS→Overlay; Comment có điều kiện→TTS; multiple events đồng thời→queue có thứ tự; mất kết nối TikTok→reconnect; action failure→retry/failure handling).
- **Files/modules**: test suite E2E (thư mục test riêng, không phải module sản phẩm).
- **Dependencies**: Không thêm mới đáng kể ngoài test runner/E2E tool đã chọn từ đầu dự án.
- **Database changes**: Không (trừ DB test riêng biệt).
- **API changes**: Không.
- **Tests**: chính milestone này LÀ test — không có "code sản phẩm" mới trừ khi cần sửa lỗi phát hiện được.
- **Acceptance criteria**: Toàn bộ lint, typecheck, unit, integration, E2E, build đều pass thật (ghi kết quả chính xác, không claim thành công nếu chưa chạy).
- **Risks**: Nếu phát hiện lỗi, chỉ sửa lỗi đó, không refactor lan man ngoài phạm vi (đúng nguyên tắc PHASE 13/15).
- **Verification method**: log output thật của từng lệnh test, lưu vào `docs/testing/TEST-REPORT.md`.

## M13 — Production hardening

- **Objective**: Tương ứng PHASE 14 (audit, không sửa code) rồi PHASE 15 (fix theo priority CRITICAL→LOW). Xem chi tiết tại 2 file prompt gốc, không lặp lại ở đây.
- **Files/modules**: Tuỳ theo audit tìm ra (không xác định trước).
- **Dependencies/DB/API changes**: Tuỳ theo audit.
- **Tests**: Regression test cho mọi fix.
- **Acceptance criteria**: Theo `PHASE_15.md` — report phải nêu rõ đã fix gì, còn gì tồn đọng, cái gì chưa production-ready — không được tuyên bố "production-ready" một cách chung chung.
- **Risks**: Không biết trước cho tới khi audit xong.
- **Verification method**: lint, typecheck, unit, integration, E2E, build chạy lại toàn bộ sau fix.
