# SYSTEM-ARCHITECTURE.md

> PHASE 03. Đọc trước: `docs/project/PROJECT_CONTEXT.md`, `docs/research/*`, `docs/product/PRD.md`.

## Quyết định tech stack (giải quyết Open question #1 của PHASE 00)

| Layer | Lựa chọn | Lý do |
|---|---|---|
| Backend runtime | Node.js 22 + TypeScript | TikTok-Live-Connector (thư viện duy nhất khả thi theo PHASE 01) là Node/TS-native — tránh phải bridge sang ngôn ngữ khác, giảm 1 lớp rủi ro. |
| HTTP API | Fastify | Nhẹ, TypeScript-first, đủ cho REST API quản lý automation. |
| Realtime transport (overlay/dashboard) | Socket.IO | Có sẵn reconnect + heartbeat theo đúng yêu cầu PHASE 10, thay vì tự viết lại bằng `ws` thuần. |
| Database | PostgreSQL | Theo định hướng PHASE 03 gốc; lưu automation, log thực thi, cấu hình. |
| Queue nội bộ (TTS/Action) | In-memory queue (custom, có interface trừu tượng) cho MVP | MVP chỉ 1 process, 1 streamer — Redis/BullMQ là over-engineering ở giai đoạn này (đúng nguyên tắc "MVP không over-engineering"). Interface `Queue<T>` được thiết kế để thay bằng Redis-backed (BullMQ) ở Phase 2 mà không đổi call site. |
| Redis | Không dùng ở MVP, để ngỏ cho Phase 2 khi cần queue bền vững qua restart hoặc multi-instance | Theo đúng "Redis nếu cần" trong PHASE 03 gốc — chưa có nhu cầu ở MVP 1 streamer/1 process. |
| Frontend (Dashboard + Overlay) | React + TypeScript + Vite | Overlay cần render animation mượt, Dashboard cần form Automation Builder — React phù hợp, hệ sinh thái lớn. |
| Validation | Zod | Dùng chung schema validate cho Event/Rule/Action ở cả backend và (một phần) frontend. |

**Redis/Queue là quyết định có điều kiện, không phải mặc định — nếu testing (PHASE 13) cho thấy in-memory queue không đủ (ví dụ mất event khi crash giữa live), sẽ nâng cấp lên BullMQ+Redis, không cần đổi kiến trúc tổng thể vì đã có interface trừu tượng.**

## Nguyên tắc

- Modular Monolith: 1 backend process, chia module rõ ràng theo boundary, không tách microservice khi chưa có lý do (chưa có, vì MVP là 1 streamer/1 process).
- Event-driven nội bộ: các module giao tiếp qua Internal Event Bus (in-process, không phải message broker ngoài) để giữ loose coupling mà không cần hạ tầng thêm.

## Cấu trúc thư mục (monorepo, npm workspaces)

```text
apps/
  server/            # Backend modular monolith
    src/
      modules/
        tiktok-adapter/     # Cô lập thư viện unofficial (NFR-1)
        event-normalizer/
        event-bus/
        rule-engine/
        action-engine/
        tts/
        audio/
        overlay-gateway/    # Socket.IO server cho overlay + dashboard
        obs/                # Phase 2, chỉ scaffold interface ở MVP nếu cần
        api/                # REST API cho dashboard (automation CRUD)
        persistence/        # Postgres repositories
      config/
      main.ts
  dashboard/          # React app quản lý automation
  overlay/            # React app hiển thị overlay (OBS Browser Source)
packages/
  shared-types/       # Zod schema: LiveEvent, Rule, Action — dùng chung
docs/                 # (đã có)
```

## Component architecture & data flow

```text
TikTok LIVE (unofficial Webcast)
 ↓
tiktok-adapter        (cô lập thư viện unofficial — xem PHASE 05)
 ↓  raw library event
event-normalizer      (chuyển thành LiveEvent nội bộ — xem EVENT-MODEL.md)
 ↓
event-bus             (in-process pub/sub, nhiều subscriber độc lập)
 ├─→ persistence.events_log   (lưu log, không chặn pipeline chính)
 ├─→ overlay-gateway → Socket.IO → Dashboard (hiển thị realtime, không qua rule engine)
 └─→ rule-engine      (xem RULE-ENGINE.md)
      ↓ matched rules → Action[]
      action-engine   (xem RULE-ENGINE.md action schema)
       ├── tts-handler      → tts module → audio playback
       ├── sound-handler    → audio module
       ├── overlay-handler  → overlay-gateway → Socket.IO → Overlay (OBS Browser Source)
       └── websocket-handler → overlay-gateway (broadcast tuỳ ý)
```

## Module boundaries (quy tắc bắt buộc)

- `tiktok-adapter` là **module duy nhất** import trực tiếp thư viện unofficial. Không module nào khác được import nó (khớp yêu cầu PHASE 05: "Core system không được phụ thuộc trực tiếp vào library-specific event object").
- `rule-engine` không được biết chi tiết implementation của TTS/OBS/audio — chỉ dispatch `Action { type: string, payload: unknown }` (đúng PHASE 07).
- `action-engine` không được biết chi tiết TikTok — chỉ nhận `LiveEvent` đã chuẩn hóa.
- `overlay-gateway` là điểm truy cập WebSocket duy nhất ra bên ngoài — cả overlay lẫn dashboard đều qua đây, không mở thêm cổng realtime khác.

## Event schema, Rule schema, Action schema

Xem chi tiết: `EVENT-MODEL.md`, `RULE-ENGINE.md`.

## Database ERD

Xem chi tiết: `DATABASE-DESIGN.md`.

## WebSocket / Queue architecture

Xem chi tiết: `REALTIME-ARCHITECTURE.md`.

## Error handling & Retry strategy

- **tiktok-adapter**: lỗi kết nối → exponential backoff reconnect (base 1s, cap 30s, jitter), giới hạn log spam (không retry log mỗi ms). Không retry vô hạn không giới hạn thời gian — sau N phút liên tục fail, chuyển trạng thái `degraded` và báo dashboard (không tự tắt hẳn, vì streamer có thể tự khắc phục, ví dụ TikTok bắt đầu live trễ).
- **action-engine**: mỗi `ActionHandler` tự khai báo có retry được hay không (idempotent thì mới nên retry). TTS/Sound: retry tối đa 2 lần với timeout ngắn (ví dụ 5s/lần). Overlay/WebSocket broadcast: không cần retry (mất 1 frame overlay không nghiêm trọng bằng gây delay dồn dập).
- Một action lỗi không được làm dừng các action còn lại trong cùng rule (NFR-4) — action-engine chạy tuần tự nhưng bọc try/catch từng action, log lỗi, tiếp tục action kế tiếp.

## Idempotency

- Mỗi `LiveEvent` có `id` (UUID sinh tại lúc normalize, deterministic theo nguồn nếu thư viện cung cấp event id gốc — nếu không có, dùng hash(type+user+timestamp+payload cơ bản) để giảm nguy cơ xử lý trùng khi thư viện gửi lặp).
- `action-engine` lưu `(eventId, ruleId, actionIndex)` đã thực thi trong execution log để tránh thực thi trùng nếu hệ thống retry ở tầng cao hơn.

## Rate limiting

- Giới hạn nội bộ cho TTS queue: tối đa N request TTS xử lý/giây (cấu hình được) để tránh gift bão → dồn hàng trăm câu TTS đọc liên tục nhiều phút không kiểm soát (PRD FR liên quan Action). Vượt ngưỡng → drop có chọn lọc (ví dụ chỉ giữ N gift giá trị cao nhất trong cửa sổ thời gian) — chi tiết thuật toán quyết định ở PHASE 09.
- Theo dõi rate limit Euler Stream (free tier 2.500 request/ngày) ở tầng `tiktok-adapter`, log cảnh báo khi gần chạm ngưỡng.

## Logging

- Structured logging (JSON) theo module, có `eventId`/`ruleId`/`actionId` để trace xuyên suốt pipeline.
- Không log nội dung nhạy cảm (credentials, token) — chỉ log đã redact.

## Security

- Không hard-code credentials (API key Euler Stream, TTS provider key, OBS password) — dùng biến môi trường, không commit `.env`.
- Overlay/Dashboard WebSocket endpoint yêu cầu token xác thực đơn giản (per-instance token sinh khi tạo overlay URL) — vì overlay URL có thể vô tình bị lộ (OBS config, screen share) nên không để mở hoàn toàn công khai không token.
- Sanitize biến trong TTS template (`{username}`, `{comment}`...) trước khi đưa vào provider để tránh injection vào lệnh hệ thống nếu TTS provider chạy local (ví dụ qua CLI).

## Configuration

- `.env` cho secrets + config môi trường (Euler Stream key, DB connection, TTS provider key, PORT...).
- Config automation (rule) lưu trong Postgres, không lưu trong file tĩnh — để dashboard sửa được realtime.

## Observability

- MVP: health check endpoint (`/health`) trả trạng thái kết nối TikTok, trạng thái DB, trạng thái queue.
- Metrics chi tiết (Prometheus...) — Phase 2, không bắt buộc MVP.

## Không tách microservice

Không có lý do kỹ thuật nào ở MVP (1 streamer, 1 process, không cần scale ngang) để tách microservice. Quyết định này sẽ được xem lại nếu roadmap SaaS đa người dùng (Future, ngoài phạm vi PRD hiện tại) được kích hoạt chính thức.
