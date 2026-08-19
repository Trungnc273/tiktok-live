# IMPLEMENTATION-PLAN.md

> PHASE 04. Chuyển kiến trúc (`docs/architecture/*`) thành kế hoạch triển khai. Chi tiết từng milestone nằm ở `MILESTONES.md`; file này nêu tổng quan, thứ tự, phụ thuộc giữa các milestone, và setup ban đầu chung.

## Thứ tự milestone và lý do

```text
M01 TikTok LIVE connection      ← không phụ thuộc gì, làm trước để xác nhận sớm nhất rủi ro lớn nhất (unofficial library) hoạt động thật trên máy
M02 Event normalization         ← phụ thuộc M01 (cần raw event thật để map)
M03 Event storage/logging       ← phụ thuộc M02 (cần LiveEvent chuẩn hoá để lưu)
M04 Rule engine                 ← phụ thuộc M02 (chạy trên LiveEvent), độc lập M03
M05 Action engine               ← phụ thuộc M04 (nhận Action[] từ Rule Engine)
M06 TTS                         ← phụ thuộc M05 (là 1 ActionHandler)
M07 Sound                       ← phụ thuộc M05, độc lập M06 (có thể làm song song)
M08 Overlay                     ← phụ thuộc M05 + hạ tầng Socket.IO (overlay-gateway)
M09 WebSocket                   ← thực chất là hạ tầng overlay-gateway dùng chung bởi M08 + Dashboard; triển khai cùng lúc/trước M08 dù đánh số sau (ghi chú lệch thứ tự bên dưới)
M10 Dashboard                   ← phụ thuộc M04 (CRUD automation), M03 (hiển thị event/log), M09 (realtime feed)
M11 OBS integration             ← phụ thuộc M05 (action mới: obs.sceneChange), độc lập phần còn lại — đúng PHASE 12: "chỉ làm sau khi core automation ổn định"
M12 Testing (E2E)               ← phụ thuộc toàn bộ M01→M11
M13 Production hardening        ← phụ thuộc kết quả audit sau M12 (tương ứng PHASE 14 audit → PHASE 15 fix trong bộ prompt gốc)
```

### Lệch thứ tự đã phát hiện và cách xử lý

Theo đúng kiến trúc (`REALTIME-ARCHITECTURE.md`), `overlay-gateway` (WebSocket, M09) là **hạ tầng nền** mà cả M08 (Overlay) lẫn M10 (Dashboard realtime feed) đều cần. Đánh số M09 sau M08 trong bộ prompt gốc chỉ là thứ tự trình bày yêu cầu, không phải thứ tự phụ thuộc bắt buộc. **Quyết định**: gộp phần khung Socket.IO server cơ bản (connect/auth token/heartbeat) vào ngay đầu M08, hoàn thiện đầy đủ (sequence/dedup/reconnect state resync) ở M09 — tránh xây overlay demo (M08) mà chưa có transport nào để bắn dữ liệu.

## Setup chung (thực hiện 1 lần, trước M01)

- Khởi tạo git repository (repo hiện chưa có git — xác nhận từ PHASE 00).
- Khởi tạo monorepo npm workspaces theo cấu trúc đã định ở `SYSTEM-ARCHITECTURE.md` (`apps/server`, `apps/dashboard`, `apps/overlay`, `packages/shared-types`).
- Cấu hình TypeScript, ESLint, Prettier dùng chung.
- Tạo `.env.example` (không commit `.env` thật) với các biến: `EULER_STREAM_API_KEY` (hoặc tương đương biến thư viện yêu cầu), `DATABASE_URL`, `PORT`, `TTS_PROVIDER`, `TTS_API_KEY` (placeholder, để trống — chọn provider thật ở M06).
- Không tạo việc này thành 1 "milestone" riêng có báo cáo M0x — nó là tiền đề kỹ thuật, sẽ được xác nhận trong report của M01 (mục "Files changed").

## Nguyên tắc áp dụng cho MỌI milestone

- Không thêm dependency ngoài phạm vi milestone đó nếu chưa cần.
- Mỗi milestone phải có báo cáo `docs/reports/M0X-REPORT.md` nêu rõ đã test thật hay chỉ mock, không được báo "thành công" nếu chưa verify.
- Milestone liên quan tới thư viện unofficial (M01) đặc biệt phải ghi rõ kết quả test **live thật** (kết nối tới 1 phòng LIVE TikTok thật) tách biệt với kết quả test bằng mock — không được gộp lẫn để trông có vẻ hoàn chỉnh hơn thực tế.

## Phạm vi KHÔNG nằm trong 13 milestone này

Theo đúng PRD (`docs/product/PRD.md`), các FR thuộc Phase 2/Future (Subscribe event, PK/battle, cooldown per-user, import/export rule JSON, video action, webhook action, multi-user/auth, billing) **không** có milestone tương ứng ở đây — sẽ được lập kế hoạch riêng sau khi MVP (M01→M13) hoàn thành và qua production audit.
