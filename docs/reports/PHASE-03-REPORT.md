# PHASE-03-REPORT.md

## Status

DONE.

## What was inspected

- `docs/project/PROJECT_CONTEXT.md`
- `docs/research/TIKTOK-LIVE-CAPABILITY.md`, `docs/research/TIKTOK-LIVE-SOURCES.md`
- `docs/product/PRD.md`

## Files created

- `docs/architecture/SYSTEM-ARCHITECTURE.md`
- `docs/architecture/EVENT-MODEL.md`
- `docs/architecture/RULE-ENGINE.md`
- `docs/architecture/DATABASE-DESIGN.md`
- `docs/architecture/REALTIME-ARCHITECTURE.md`
- `docs/reports/PHASE-03-REPORT.md`

## Files changed

Không có (chưa viết code, đúng yêu cầu "Không code" của PHASE 03).

## Findings / quyết định chính

- **Chốt tech stack** (giải quyết Open question #1 từ PHASE 00): Node.js 22 + TypeScript, Fastify (REST API), Socket.IO (realtime overlay/dashboard), PostgreSQL, React + Vite cho dashboard/overlay, Zod cho validation dùng chung. Lý do: khớp trực tiếp với TikTok-Live-Connector (Node/TS-native), tránh thêm 1 lớp rủi ro bridge ngôn ngữ.
- **Redis/Queue bền vững KHÔNG dùng ở MVP** — dùng in-memory queue có interface trừu tượng để nâng cấp không phá vỡ kiến trúc khi cần (quyết định có điều kiện, không phải mặc định "không bao giờ cần Redis").
- Modular Monolith, 1 process, chia module rõ ranh giới (`tiktok-adapter` cô lập thư viện unofficial, `rule-engine` không biết chi tiết action implementation, `action-engine` không biết chi tiết TikTok).
- Rule Engine mặc định thực thi **tất cả** rule khớp (không dừng ở rule đầu tiên) — ghi rõ đây là quyết định thiết kế tường minh, không phải thiếu sót, vì khớp với ví dụ PRD ("Gift Rose → Sound + TTS + Overlay" là nhiều action trong 1 rule, không phải nhiều rule loại trừ nhau).
- Database: không có bảng `users`/auth ở MVP (khớp PRD: multi-user là Future) — tránh tạo sẵn hạ tầng cho tính năng chưa được yêu cầu chính thức.

## Unknowns

- ORM/query builder cụ thể cho Postgres — để PHASE 04/05 quyết định (chi tiết implementation, không phải quyết định kiến trúc).
- Chính sách retention cụ thể cho `events_log` (bao nhiêu ngày) — chưa chốt số, cần PHASE 04 biến thành 1 task cụ thể.
- Ngưỡng rate-limit chính xác cho TTS queue (bao nhiêu request/giây) — sẽ đo thực tế ở PHASE 13, không đoán số ở đây.

## Risks

- Quyết định "in-memory queue" đánh đổi: mất job đang chờ nếu process crash giữa live — đã ghi rõ trong `REALTIME-ARCHITECTURE.md`, chấp nhận được cho MVP 1 streamer, không che giấu rủi ro này.
- `conditions`/`actions` lưu jsonb (không chuẩn hoá quan hệ) — đánh đổi khả năng query SQL phức tạp lấy sự đơn giản, chấp nhận được ở quy mô MVP.

## Next phase

PHASE 04 — Implementation Plan (chuyển kiến trúc này thành milestone M01→M13 cụ thể, xác định file/module, test, acceptance criteria cho từng milestone).

## Verification performed

- Toàn bộ quyết định kiến trúc đối chiếu ngược lại với ràng buộc đã xác nhận ở PHASE 01 (unofficial library) và PHASE 02 (PRD, đặc biệt NFR-1 cô lập adapter) — không thiết kế gì mâu thuẫn với 2 tài liệu đó.
- Không viết code, không cài dependency (đúng yêu cầu PHASE 03).

---

Đã hoàn thành PHASE 03. Dừng. Không tự chuyển sang PHASE 04.
