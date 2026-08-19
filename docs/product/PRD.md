# PRD.md — TikTok LIVE Automation Platform

> PHASE 02. Đọc trước: `docs/project/PROJECT_CONTEXT.md`, `docs/research/TIKTOK-LIVE-CAPABILITY.md`, `docs/research/TIKTOK-LIVE-SOURCES.md`.

## Product vision

Một công cụ self-hosted (chạy local hoặc trên VPS riêng của streamer) giúp một streamer TikTok LIVE tự động phản hồi tương tác của khán giả trong lúc live — không cần biết code — bằng cách định nghĩa rule dạng `WHEN event → THEN action` (đọc lời cảm ơn bằng TTS, phát âm thanh, hiện hiệu ứng overlay trên OBS) khi có Follow/Like/Comment/Share/Gift.

Sản phẩm được xây trên nền tảng kỹ thuật **không chính thức** (unofficial reverse-engineered library, xem PHASE 01) — đây là ràng buộc nền tảng, không phải chi tiết triển khai có thể "giấu đi" khỏi PRD.

## Target users

- **Primary**: streamer TikTok LIVE cá nhân/nhóm nhỏ, không có kiến thức lập trình, tự vận hành 1 phòng live tại một thời điểm.
- **Không phải** đối tượng MVP: agency quản lý nhiều streamer cùng lúc, nền tảng SaaS đa khách hàng thu phí (xem "Out of scope").

## User stories

1. Là streamer, tôi muốn khi có người Follow thì hệ thống tự đọc "Cảm ơn {username} đã follow!" bằng giọng nói, để tôi không phải tự nói liên tục.
2. Là streamer, tôi muốn khi ai đó tặng gift "Rose" thì phát âm thanh + hiện animation trên màn hình overlay (OBS), để buổi live sinh động hơn.
3. Là streamer, tôi muốn tạo rule kiểu "Comment chứa chữ 'hello' → TTS" mà không cần viết code, chỉ chọn trong giao diện.
4. Là streamer, tôi muốn thấy dashboard hiển thị số viewer, like, comment, gift theo thời gian thực trong lúc đang live.
5. Là streamer, tôi muốn bật/tắt từng automation rule riêng lẻ mà không ảnh hưởng các rule khác.
6. Là streamer, tôi muốn hệ thống tự kết nối lại nếu mất kết nối tới TikTok LIVE giữa buổi live, để không bỏ lỡ event.
7. Là streamer, tôi muốn biết rõ giới hạn/rủi ro (ví dụ: có thể mất kết nối bất ngờ do TikTok đổi hệ thống) để tôi không phụ thuộc 100% vào công cụ này cho một buổi live quan trọng.

## Functional requirements

### Event (nguồn: PHASE 01 xác nhận khả dụng qua unofficial library)

- FR-1 Follow event — MVP
- FR-2 Like event (aggregate realtime) — MVP
- FR-3 Comment event — MVP
- FR-4 Share event — MVP
- FR-5 Gift event (kèm tên, giá trị, streak) — MVP
- FR-6 Join/viewer count event — MVP
- FR-7 Subscribe/Super Fan event — Phase 2 (PHASE 01 xác nhận khả dụng nhưng kém ổn định hơn nhóm cơ bản)
- FR-8 PK/battle event — Future (PHASE 01 xác nhận độ ổn định thấp, rủi ro cao hơn)

### Automation (Trigger → Conditions → Actions)

- FR-9 Tạo rule: chọn 1 event type làm trigger — MVP
- FR-10 Điều kiện: equals, not equals, contains, greater than, less than, greater/equal, AND, OR — MVP
- FR-11 Nhiều action theo thứ tự cho 1 rule — MVP
- FR-12 Bật/tắt rule, xóa, nhân bản (duplicate) — MVP
- FR-13 Per-user cooldown / rate limit cho rule (chống spam khi 1 người gửi gift liên tục) — Phase 2
- FR-14 Rule priority khi nhiều rule cùng khớp 1 event — MVP (thứ tự xác định, không random)
- FR-15 Import/export rule dạng JSON — Phase 2

### Action

- FR-16 TTS (đọc tên/nội dung, template có biến `{username}`, sanitize input) — MVP
- FR-17 Phát âm thanh (mp3/wav) — MVP
- FR-18 Overlay alert (hiện trên OBS qua Browser Source: text, hình ảnh, animation cơ bản) — MVP
- FR-19 WebSocket broadcast (để overlay/dashboard nhận realtime) — MVP
- FR-20 Video action — Phase 2
- FR-21 OBS scene control (đổi scene, show/hide source) — Phase 2
- FR-22 Webhook action (gọi HTTP ra ngoài) — Phase 2
- FR-23 Game integration — Future

### Dashboard

- FR-24 Xem trạng thái LIVE, viewer, like, comment, gift realtime — MVP
- FR-25 Danh sách automation: tạo/sửa/xóa/bật-tắt/nhân bản — MVP
- FR-26 Automation Builder dạng form (không cần viết code/JSON tay) — MVP
- FR-27 Lịch sử thực thi rule (log) — Phase 2
- FR-28 Multi-user / phân quyền / auth nhiều tài khoản — Future (xem Out of scope)

## Non-functional requirements

- NFR-1 Cô lập hoàn toàn thư viện unofficial trong 1 adapter layer (đã định hướng ở PHASE 05) — core hệ thống không phụ thuộc trực tiếp object của thư viện, để khi thư viện đổi/gãy chỉ phải sửa 1 chỗ.
- NFR-2 Không hard-code, không commit credentials/API key (Euler Stream key, TTS provider key...).
- NFR-3 Tự động reconnect khi mất kết nối TikTok LIVE, có giới hạn retry hợp lý (không retry vô hạn gây spam).
- NFR-4 Action failure không được làm sập toàn bộ automation (1 action lỗi không chặn action khác trong cùng rule, trừ khi thiết kế cố ý).
- NFR-5 Chịu được burst event (gift bão, like bão) mà không nghẽn queue TTS/overlay.
- NFR-6 Overlay phải hoạt động ổn định như 1 OBS Browser Source (không giật, không mất kết nối khi để chạy nhiều giờ).
- NFR-7 Không cam kết SLA/uptime — vì nền tảng phụ thuộc thư viện unofficial (xem Risks).

## MVP

Tổng hợp: FR-1 → FR-6, FR-9 → FR-12, FR-14, FR-16 → FR-19, FR-24 → FR-26, cùng toàn bộ NFR.

MVP phục vụ **1 streamer, 1 phiên live tại một thời điểm**, chạy self-hosted (local hoặc VPS cá nhân). Không có khái niệm "khách hàng trả phí" ở MVP.

## Future roadmap

- **Phase 2** (sau khi MVP ổn định qua PHASE 13/14/15): FR-7, FR-13, FR-15, FR-20, FR-21, FR-22, FR-27.
- **Future** (không cam kết thời điểm): FR-8, FR-23, FR-28 và toàn bộ hướng SaaS đa người dùng — chỉ nên theo đuổi sau khi đã đánh giá lại rủi ro pháp lý/license (AGPL) và có phương án dự phòng nếu thư viện unofficial ngừng hoạt động.

## Explicit out-of-scope (MVP)

- Multi-tenant / nhiều streamer dùng chung 1 instance với tài khoản riêng.
- Thu phí / billing / subscription.
- Auth nhiều người dùng, phân quyền role.
- SLA/uptime commitment dưới bất kỳ hình thức nào.
- Hỗ trợ đồng thời nhiều phòng LIVE cùng lúc.
- Game integration.
- Tự động chuyển đổi sang official API khi/nếu TikTok phát hành (sẽ đánh giá lại nếu điều này xảy ra, không thiết kế trước cho một API chưa tồn tại).

## Risks (kế thừa từ PHASE 01, không lặp lại chi tiết — xem `TIKTOK-LIVE-CAPABILITY.md`)

- Phụ thuộc hoàn toàn thư viện unofficial → có thể ngừng hoạt động bất cứ lúc nào nếu TikTok đổi Webcast protocol. **Không có phương án khắc phục kỹ thuật**, chỉ có thể giảm nhẹ tác động bằng adapter layer cô lập (NFR-1) để thay thế nhanh nếu có fork/thư viện khác thay thế.
- Vi phạm TikTok Developer ToS (cấm reverse engineering) — chấp nhận rủi ro này cho phạm vi dự án cá nhân theo quyết định của chủ dự án (đã xác nhận ở PHASE 01). Không mở rộng ra thương mại hóa mà không đánh giá lại.
- License AGPL sửa đổi của thư viện lõi — chưa đọc chi tiết đầy đủ, cần đọc trước khi tính đến phân phối/thương mại hóa (giữ nguyên UNKNOWN, không tự suy diễn).
- Rate limit Euler Stream free tier (2.500 request/ngày) có thể không đủ nếu 1 phiên live rất sôi động (nhiều nghìn like/comment) — cần theo dõi thực tế ở giai đoạn testing (PHASE 13), có thể phải nâng gói trả phí.

## Acceptance criteria (cho toàn bộ MVP)

- Một streamer không biết code có thể tự tạo rule `Gift Rose → TTS + Animation` chỉ qua giao diện, không cần viết JSON/code tay (khớp yêu cầu PHASE 11).
- Follow/Like/Comment/Share/Gift/Join thực tế trên 1 phòng LIVE TikTok kích hoạt đúng automation đã cấu hình, có bằng chứng test thật (không chỉ mock) trước khi coi MVP hoàn thành (khớp yêu cầu PHASE 13).
- Mất kết nối TikTok giữa chừng → tự reconnect mà không cần thao tác thủ công.
- Toàn bộ rủi ro ở trên được ghi rõ trong tài liệu người dùng cuối (không giấu trong code).
