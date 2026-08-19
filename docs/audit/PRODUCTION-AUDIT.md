# PRODUCTION-AUDIT.md — Production Readiness Audit (PHASE 14)

Vai trò: Principal Engineer + Security Engineer + SRE + QA Lead. Toàn bộ implementation M01→M12 đã được review. **Không sửa code ở tài liệu này** — chỉ audit, phân loại, để PHASE 15 xử lý theo thứ tự ưu tiên.

---

## CRITICAL

Không có finding nào ở mức CRITICAL (không có lỗ hổng dẫn tới mất dữ liệu diện rộng, remote code execution, hay crash toàn hệ thống không kiểm soát được).

---

## HIGH

### H1 — `LiveEvent.id` không deterministic → mất khả năng chống trùng event ở tầng nhận

**File**: `apps/server/src/modules/event-normalizer/normalize.ts:65`

`baseFields()` sinh `id: randomUUID()` **mới hoàn toàn mỗi lần gọi `normalizeAdapterEvent()`**, bất kể raw event từ thư viện TikTok có phải bản trùng lặp (duplicate) hay không. Điều này **trái với chính thiết kế đã ghi trong `docs/architecture/EVENT-MODEL.md`**:

> "Mỗi LiveEvent có id (UUID sinh tại lúc normalize, **deterministic theo nguồn nếu thư viện cung cấp event id gốc** — nếu không có, dùng hash(type+user+timestamp+payload cơ bản) để giảm nguy cơ xử lý trùng khi thư viện gửi lặp)."

**Hậu quả thực tế**: nếu `tiktok-live-connector` gửi lặp 1 event (hành vi đã biết xảy ra với các thư viện WebSocket khi reconnect/replay buffer — không phải giả thuyết, là rủi ro đã lường trước khi viết `EVENT-MODEL.md`), hệ thống sẽ tạo 2 `LiveEvent` với `id` khác nhau cho cùng 1 sự kiện thật → Rule Engine khớp 2 lần → **TTS đọc 2 lần, gift bị "cảm ơn" 2 lần** cho cùng 1 tương tác. Cơ chế idempotency ở tầng Action Engine (M05, unique index `event_id+automation_id+action_index`) **không cứu được** vì 2 `event_id` khác nhau ngay từ đầu — bản thân nó hoạt động đúng thiết kế, chỉ là input đầu vào (event id) đã sai từ trước.

**Đã verify bằng đọc code trực tiếp**, không phải suy đoán.

---

## MEDIUM

### M1 — `GET /health` không phản ánh trạng thái thật

**File**: `apps/server/src/modules/api/http-server.ts:25`

Luôn trả `{status:"ok"}` bất kể DB/TikTok có kết nối được hay không — trái với `SYSTEM-ARCHITECTURE.md` ("health check endpoint trả trạng thái kết nối TikTok, trạng thái DB, trạng thái queue"). Nếu dùng làm Docker healthcheck/load balancer probe, hệ thống có thể bị coi là "khỏe" trong khi DB đã chết.

### M2 — REST API không có custom error handler → có thể lộ chi tiết lỗi nội bộ

**File**: `apps/server/src/modules/api/http-server.ts` (toàn file, không có `setErrorHandler`)

Lỗi không được bắt tường minh trong route handler (ví dụ Postgres timeout trong `automationsRepository.list()`) sẽ rơi vào error handler mặc định của Fastify, có thể trả `error.message` gốc (bao gồm chi tiết nội bộ như connection string, stack) ra response JSON cho client. Rủi ro thông tin (information disclosure), không phải RCE.

### M3 — `docker-compose.yml` chứa password dạng plaintext, đã commit vào git

**File**: `docker-compose.yml`

`POSTGRES_PASSWORD: tiktok_live_dev_only` — dù được đặt tên rõ ràng là "dev only" và chỉ bind `127.0.0.1`, việc commit bất kỳ credential nào (kể cả giả định là vô hại) vào lịch sử git là thói quen xấu, dễ bị copy nguyên khi fork/deploy mà không đổi.

### M4 — TTSQueue drop job khi đầy hàng đợi nhưng không log/không quan sát được

**File**: `apps/server/src/modules/tts/tts-queue.ts:32,48` + `apps/server/src/main.ts`

`droppedCount` tăng lên khi hàng đợi đầy (gift bão) nhưng **không nơi nào đọc giá trị này** để log cảnh báo hay hiển thị trên Dashboard — streamer sẽ không biết một số lời cảm ơn TTS đã bị âm thầm bỏ qua.

---

## LOW

### L1 — `.env.example` không đầy đủ

**File**: `.env.example`

Thiếu `PORT`, `PUBLIC_BASE_URL`, `MEDIA_DIR`, `SOUNDS_DIR`, `OBS_WEBSOCKET_URL`, `OBS_WEBSOCKET_PASSWORD` — các biến này được thêm từ M08-M11 nhưng file mẫu chưa được cập nhật theo, gây khó khăn khi người khác setup lần đầu.

### L2 — REST API không cấu hình CORS

**File**: `apps/server/src/modules/api/http-server.ts`

Không có `@fastify/cors` — nếu deploy `apps/dashboard` build tĩnh trên domain/port khác server API (khác kịch bản dev hiện tại dùng Vite proxy), trình duyệt sẽ chặn request bằng CORS policy mặc định. Không phải lỗi bảo mật, mà là gap chức năng khi triển khai thật.

### L3 — Không có Dockerfile cho `apps/server`/`apps/dashboard`/`apps/overlay`

`docker-compose.yml` chỉ có Postgres — chưa container hoá chính ứng dụng, cần thiết nếu muốn deploy VPS bằng Docker thay vì chạy `node`/`pm2` trực tiếp.

### L4 — Chưa có chính sách retention cho `events_log`

Đã ghi UNKNOWN từ `DATABASE-DESIGN.md` (PHASE 03) — nhắc lại ở đây vì đây là rủi ro production thật (bảng phình vô hạn nếu chạy live nhiều giờ mỗi ngày trong thời gian dài), chưa có task cụ thể xử lý.

---

## INFO

### I1 — Rủi ro nền tảng đã biết từ PHASE 01 (không phải finding mới)

Toàn bộ hệ thống phụ thuộc thư viện unofficial `tiktok-live-connector` — rủi ro TikTok đổi protocol, rủi ro pháp lý (Developer ToS), rủi ro license AGPL nếu thương mại hóa. Đã ghi đầy đủ ở `docs/research/TIKTOK-LIVE-CAPABILITY.md` và `docs/product/PRD.md`. Không có gì để "fix" bằng code — chỉ nhắc lại để không bị quên trong tổng kết cuối.

### I2 — `WindowsSapiProvider` (TTS) chỉ chạy trên Windows

Đã ghi rõ từ M06. Nếu deploy Linux VPS (câu hỏi người dùng đặt ra trong lúc làm M11), **bắt buộc phải đổi provider** (ví dụ Piper/espeak-ng) trước khi chạy production trên Linux — nhờ có `TTSProvider` abstraction, việc này không đụng tới Rule Engine/Action Engine.

### I3 — OBS integration chưa từng test với OBS Studio thật

Đã ghi rõ ở M11-REPORT.md — máy dev không cài OBS. Chỉ verify bằng mocked server.

### I4 — Không có auth cho namespace `/dashboard` và không có auth cho toàn bộ REST API `/api/*`

Chấp nhận được cho MVP self-hosted local (đã ghi rõ trong `REALTIME-ARCHITECTURE.md` từ M09) — nhưng đây là **điều kiện bắt buộc phải có trước khi deploy VPS công khai** (ai cũng có thể gọi `POST /api/automations` nếu port mở ra Internet). Không phải bug — là điều kiện tiên quyết chưa được implement vì ngoài phạm vi MVP theo PRD.

---

## Tổng kết số lượng

| Mức độ | Số lượng |
|---|---|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 4 |
| INFO | 4 |

## Không sửa gì ở tài liệu này

Đúng yêu cầu PHASE 14 — toàn bộ finding trên **chưa được sửa**. PHASE 15 sẽ xử lý theo thứ tự CRITICAL → HIGH → MEDIUM → LOW.
