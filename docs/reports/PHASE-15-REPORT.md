# PHASE-15-REPORT.md — Production Hardening

Xử lý theo đúng thứ tự ưu tiên từ `docs/audit/PRODUCTION-AUDIT.md`: HIGH → MEDIUM → LOW. Không refactor ngoài phạm vi, không đổi product requirement.

---

## HIGH

### H1 — `LiveEvent.id` không deterministic → mất khả năng chống trùng event

- **Root cause**: `baseFields()` trong `event-normalizer/normalize.ts` gọi `randomUUID()` (Node crypto) — sinh id mới hoàn toàn mỗi lần gọi hàm, bất kể input có giống hệt lần trước hay không.
- **Fix**: Thêm `deriveEventId()` — ưu tiên `common.msgId` (có trên hầu hết message type theo `tiktok-live-proto/v3`) đưa qua `uuidv5()` (namespace cố định, deterministic tuyệt đối theo nguồn); nếu vắng mặt, fallback hash `uuidv5(eventName + JSON(safeData))` — **không** bao gồm `receivedAt` (thời điểm nhận), vì 2 lần gửi lặp cùng nội dung có thể đến ở 2 thời điểm khác nhau, đưa `receivedAt` vào sẽ vô hiệu hoá chính mục đích chống trùng.
- **Files changed**: `apps/server/src/modules/event-normalizer/normalize.ts`, `apps/server/package.json` (nâng `uuid` 9→11, thêm `v5` export có type — tiện thể dọn luôn cảnh báo deprecated đã ghi từ M01-REPORT).
- **Tests**: 3 test mới trong `normalize.test.ts` — cùng raw event (có/không có `common.msgId`) normalize 2 lần cho ra **cùng 1 id**; 2 event khác nội dung cho **id khác nhau** (không phải hash cố định vô nghĩa cho mọi input).
- **Result**: ✅ FIXED, verify bằng test tự động.

---

## MEDIUM

### M1 — `GET /health` không phản ánh trạng thái thật

- **Root cause**: route trả cứng `{status:"ok"}`.
- **Fix**: thêm `checkDb` (optional, để test không cần DB vẫn chạy được) — health check gọi `db.execute(sql\`select 1\`)` thật, trả `db: true/false/null` + `tiktokConnectionState` từ `StatusTracker`; **503** nếu DB lỗi thay vì giả vờ khoẻ mạnh.
- **Files changed**: `apps/server/src/modules/api/http-server.ts`, `apps/server/src/main.ts` (truyền `checkDb` thật).
- **Tests**: 3 test (không cấu hình checkDb → `db:null`; checkDb thành công → `db:true`; checkDb lỗi → **503** + `db:false`).
- **Verify thật**: chạy `main.ts` thật với Postgres thật, gọi `curl http://localhost:3000/health` → `{"status":"ok","db":true,"tiktokConnectionState":"connected"}` — không phải suy đoán từ test, là response thật.
- **Result**: ✅ FIXED.

### M2 — REST API có thể lộ chi tiết lỗi nội bộ

- **Fix**: thêm `app.setErrorHandler()` — log đầy đủ lỗi (kèm stack) ở server, chỉ trả `{error: "Lỗi máy chủ nội bộ"}` chung cho response 5xx ra client; lỗi 4xx (validation, do chính route set `reply.code()` tường minh) vẫn giữ message rõ ràng cho UX.
- **Files changed**: `apps/server/src/modules/api/http-server.ts`.
- **Tests**: 1 test — automations repository throw lỗi chứa 1 chuỗi "bí mật" giả lập, xác nhận response **không chứa** chuỗi đó, chỉ có message chung.
- **Result**: ✅ FIXED.

### M3 — `docker-compose.yml` chứa password plaintext đã commit

- **Fix**: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-tiktok_live_dev_only}` — đọc từ biến môi trường, chỉ dùng giá trị dev làm fallback tường minh (có ghi chú), thay vì hardcode không thể override. Thêm `POSTGRES_PASSWORD` vào `.env.example`.
- **Files changed**: `docker-compose.yml`, `.env.example`.
- **Tests**: xác nhận bằng `docker compose config` (lệnh thật) — override hoạt động đúng.
- **Result**: ✅ FIXED (giảm thiểu — vẫn còn giá trị fallback dev trong file, đã ghi chú rõ ràng; không xoá hẳn vì cần 1 giá trị mặc định để `docker compose up` chạy được ngay không cần setup `.env` trước, chấp nhận được cho dev).

### M4 — TTSQueue drop job âm thầm, không log

- **Fix**: `tts-action-handler.ts` bọc `queue.enqueue()` trong try/catch, log `logger.warn` kèm `droppedCount` khi phát hiện lỗi "hàng đợi đầy", rồi rethrow (giữ nguyên hành vi action `failed` như cũ, chỉ thêm observability).
- **Files changed**: `apps/server/src/modules/tts/tts-action-handler.ts`.
- **Tests**: 1 test mới — `TTSQueue({maxQueueSize:0})` (luôn đầy), xác nhận action `failed` + log warning xuất hiện + `droppedCount` tăng đúng.
- **Result**: ✅ FIXED.

---

## LOW

### L1 — `.env.example` thiếu biến

- **Fix**: bổ sung đầy đủ `PORT`, `PUBLIC_BASE_URL`, `CORS_ORIGIN`, `MEDIA_DIR`, `SOUNDS_DIR`, `OBS_WEBSOCKET_URL`, `OBS_WEBSOCKET_PASSWORD`, `POSTGRES_PASSWORD`.
- **Result**: ✅ FIXED.

### L2 — REST API không cấu hình CORS

- **Fix**: đăng ký `@fastify/cors`, mặc định `origin: "*"` cho dev, đọc `CORS_ORIGIN` từ env để thắt chặt khi deploy production.
- **Files changed**: `apps/server/src/modules/api/http-server.ts`, `apps/server/src/main.ts`, `apps/server/package.json` (thêm `@fastify/cors`).
- **Result**: ✅ FIXED.

### L3 — Không có Dockerfile cho các app

- **Result**: ⏭️ SKIPPED. Không container hoá app trong phạm vi phase này — không có acceptance criteria nào của MVP yêu cầu Docker cho chính ứng dụng (chỉ Postgres cần, đã có từ M03). Đây là công việc deployment-time, để lại cho người vận hành quyết định (VPS chạy trực tiếp bằng `pm2`/`systemd`, hoặc tự viết Dockerfile khi cần) — không tự ý thêm để tránh phình phạm vi ngoài PRD.

### L4 — Chưa có chính sách retention `events_log`

- **Result**: ⏭️ SKIPPED. Vẫn là UNKNOWN từ PHASE 03, chưa có con số cụ thể (bao nhiêu ngày) được thống nhất — không tự quyết định 1 con số tuỳ tiện. Khuyến nghị: thêm job dọn dẹp định kỳ (ví dụ giữ 30 ngày) ở Phase 2 khi có dữ liệu thực tế về tốc độ phình bảng.

---

## INFO (không sửa — bản chất không phải bug code)

I1 (rủi ro nền tảng TikTok unofficial), I2 (TTS Windows-only, cần đổi provider cho Linux), I3 (chưa test OBS thật), I4 (không có auth `/dashboard` + REST API — chấp nhận được cho MVP local, bắt buộc phải có trước khi deploy VPS công khai) — giữ nguyên như audit đã ghi, không thuộc phạm vi "sửa code" của phase này.

---

## Kết quả chạy lại toàn bộ sau khi sửa

```text
$ npm run lint                                    → 0 lỗi (exit 0)
$ npm run typecheck --workspaces --if-present     → 3/3 app sạch
$ npm run test --workspaces --if-present          → 25 test files, 136 tests — TẤT CẢ PASS
                                                     (dashboard 10, overlay 9, server 117)
$ npm run build --workspaces --if-present         → 3/3 app build thành công
```

Verify thật ngoài test tự động: chạy `apps/server` thật với Postgres thật, gọi `GET /health` thật → `db:true` xác nhận đúng.

## Cái gì đã fix

H1 (HIGH), M1-M4 (4 MEDIUM), L1-L2 (2/4 LOW) — 7/9 finding có thể sửa bằng code đã được sửa và verify bằng test + chạy thật.

## Cái gì còn tồn đọng

- L3 (Dockerfile cho app) — cố ý không làm, ngoài phạm vi MVP.
- L4 (retention policy `events_log`) — cần quyết định con số cụ thể trước khi implement, để lại UNKNOWN có chủ đích.
- I1-I4 — không phải bug, là điều kiện/rủi ro cần biết trước khi vận hành thật (đặc biệt **I4: bắt buộc thêm auth trước khi deploy VPS công khai** — đây là điều kiện tiên quyết quan trọng nhất còn lại).

## Cái gì bị block

Không có gì bị block hoàn toàn — L3/L4 là "chưa làm vì chưa cần", không phải "không làm được".

## KHÔNG production-ready cho trường hợp nào

- **Deploy VPS công khai (Internet)**: chưa an toàn — thiếu auth cho REST API + `/dashboard` namespace (I4). Bất kỳ ai biết IP/domain đều gọi được `POST /api/automations`, `DELETE /api/automations/:id` không cần đăng nhập.
- **Linux VPS**: chưa chạy được TTS thật — `WindowsSapiProvider` chỉ chạy Windows (I2), cần đổi provider trước.
- **Production dài hạn không giám sát**: `events_log` sẽ phình vô hạn (L4), queue in-memory mất dữ liệu khi crash (đã ghi từ M09, chấp nhận được cho MVP nhưng không phải "production-grade" theo chuẩn cao).
- **OBS integration**: chưa từng verify với OBS Studio thật (I3) — chỉ tin tưởng được ở mức "logic đúng qua mocked server", chưa phải "đã dùng thật".

Phù hợp cho: **1 streamer tự vận hành, self-hosted trên máy/VPS riêng có kiểm soát truy cập mạng (firewall/VPN, không mở port công khai)** — đúng đối tượng MVP theo `docs/product/PRD.md`.

---

Không tuyên bố "production-ready" một cách chung chung — mức độ sẵn sàng phụ thuộc hoàn toàn vào kịch bản triển khai cụ thể như liệt kê ở trên.
