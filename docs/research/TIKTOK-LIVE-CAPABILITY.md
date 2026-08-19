# TIKTOK-LIVE-CAPABILITY.md

Research thực hiện: 2026-08-19. Nguồn: xem `TIKTOK-LIVE-SOURCES.md`.

## Câu hỏi bắt buộc (theo PHASE 01)

1. **TikTok chính thức cung cấp những LIVE event nào?** → **Không có.** Cổng developers.tiktok.com không có sản phẩm/API nào cho LIVE streaming events. Xác nhận qua fetch trực tiếp trang chính thức.
2. **Event nào có thể lấy realtime?** → Chỉ lấy được qua **unofficial** library (đọc Webcast push service): chat comment, gift (kèm streak), like, follow, share, join/viewer count, subscribe/member, Q&A, một số sự kiện battle/PK, moderation event.
3. **Follow có lấy được không?** → Có, qua unofficial library. Không có qua official API.
4. **Like có lấy được không?** → Có, qua unofficial library (dạng aggregate/realtime like count + like event). Không có qua official API.
5. **Comment có lấy được không?** → Có, qua unofficial library (chat message event). Không có qua official API.
6. **Share có lấy được không?** → Có, qua unofficial library. Không có qua official API.
7. **Gift có lấy được không?** → Có, qua unofficial library, kèm thông tin streak/combo, tên/giá trị gift. Không có qua official API.
8. **Join/viewer event có lấy được không?** → Có, qua unofficial library (member join, viewer count). Không có qua official API.
9. **Subscription/member event có lấy được không?** → Có (subscribe/Super Fan), qua unofficial library.
10. **PK/battle event có lấy được không?** → Có, hỗ trợ một phần qua unofficial library (tùy phiên bản), độ ổn định thấp hơn các event cơ bản.
11. **Có API chính thức không?** → **Không**, cho phạm vi LIVE events cần dùng.
12. **Có cần app review không?** → Không áp dụng cho hướng unofficial (không qua TikTok review). Các API official khác (Content Posting API...) có yêu cầu app review 5–10 ngày làm việc, nhưng không liên quan tới LIVE event nên MVP không cần.
13. **Có OAuth không?** → Không cần OAuth để đọc unofficial Webcast của một phòng LIVE công khai (không cần đăng nhập tài khoản TikTok của streamer). Đây cũng là lý do nó "dễ dùng" nhưng chính là phần TikTok không chính thức hỗ trợ/bảo đảm.
14. **Có giới hạn quyền truy cập không?** → Có giới hạn thực tế qua dịch vụ ký request bên thứ ba (Euler Stream): free tier 2.500 request/ngày, 25 cloud WebSocket. Vượt ngưỡng phải trả phí (từ $50/tháng cho gói Business).
15. **Có thể dùng unofficial library không?** → Có thể dùng về mặt kỹ thuật. Về mặt hợp đồng, TikTok Developer ToS cấm rõ hành vi reverse engineering/scraping/automated access không được uỷ quyền — thư viện unofficial về bản chất đi ngược lại điều khoản này.
16. **Rủi ro khi dùng unofficial library là gì?**
    - TikTok có thể đổi giao thức Webcast bất cứ lúc nào → mất kết nối đột ngột, không có SLA/thông báo trước.
    - Vi phạm Developer ToS (cấm reverse engineering) → rủi ro pháp lý/tài khoản nếu TikTok truy vết và có phản ứng, dù rủi ro thực tế với cá nhân/dự án nhỏ được cộng đồng đánh giá là thấp nhưng **không phải bằng 0**.
    - License AGPL (bản sửa đổi) của TikTok-Live-Connector hạn chế dùng thương mại — cần đọc kỹ điều khoản license cụ thể trước khi thương mại hóa.
    - Phụ thuộc dịch vụ ký request bên thứ ba (Euler Stream) — thêm một single point of failure và chi phí ngoài tầm kiểm soát của TikTok lẫn của mình.
17. **Nếu làm SaaS thì rủi ro nào cần đặc biệt quan tâm?**
    - Không có SLA nào từ TikTok hay từ thư viện unofficial → không thể cam kết uptime với khách hàng trả phí.
    - Rủi ro pháp lý nhân lên khi thu phí người dùng khác dựa trên hành vi vi phạm ToS của bên thứ ba (TikTok).
    - Chi phí Euler Stream tăng tuyến tính theo số streamer đồng thời kết nối → cần tính vào mô hình giá.
    - License AGPL của thư viện lõi có thể yêu cầu mở mã nguồn phần phái sinh nếu phân phối theo một số hình thức nhất định — cần luật sư/đọc kỹ nếu tiến tới SaaS thương mại thật sự.

## Bảng so sánh

| Capability | Official | Unofficial | Difficulty | Risk |
|---|---|---|---|---|
| Follow event realtime | Không | Có | Thấp (thư viện có sẵn) | Trung bình-Cao (phụ thuộc protocol không ổn định) |
| Like event realtime | Không | Có | Thấp | Trung bình-Cao |
| Comment event realtime | Không | Có | Thấp | Trung bình-Cao |
| Share event realtime | Không | Có | Thấp | Trung bình-Cao |
| Gift event realtime (kèm giá trị) | Không | Có | Thấp-Trung bình | Trung bình-Cao |
| Join/viewer count | Không | Có | Thấp | Trung bình |
| Subscribe/Super Fan | Không | Có (một phần) | Trung bình | Trung bình-Cao |
| PK/battle | Không | Có (một phần, kém ổn định) | Trung bình-Cao | Cao |
| Uptime/SLA | Không áp dụng (không có sản phẩm) | Không có | — | Cao nếu cam kết SaaS |
| Pháp lý (Developer ToS) | An toàn nếu dùng đúng sản phẩm official | Vi phạm ToS về reverse engineering | — | Cao nếu thương mại hóa quy mô lớn, Thấp-Trung bình cho dự án cá nhân/nhỏ |

## Trả lời câu hỏi bắt buộc của Acceptance Criteria

> "Nếu hôm nay bắt đầu code, chúng ta lấy realtime TikTok LIVE event bằng cách nào?"

**Trả lời**: Dùng thư viện unofficial **TikTok-Live-Connector** (Node.js/TypeScript), kết nối tới Webcast push service của phòng LIVE công khai qua @uniqueId của streamer, không cần OAuth/đăng nhập. Cần đăng ký API key ở Euler Stream (free tier đủ dùng cho 1 dự án cá nhân/1 streamer) để dịch vụ này ký request thay (msToken/X-Bogus). Đây là cách **duy nhất khả thi hiện tại** — không có phương án official nào thay thế.

**Mức độ chắc chắn**: Cao đối với "cách kết nối hoạt động được hôm nay" (đã được hàng nghìn dự án cộng đồng xác nhận, thư viện có 2.1k sao, cập nhật đều). Thấp-Trung bình đối với "sẽ tiếp tục hoạt động ổn định lâu dài" — vì TikTok có thể đổi protocol/chặn bất cứ lúc nào và đây là bản chất rủi ro không thể loại bỏ, chỉ có thể giảm nhẹ (cô lập trong adapter layer — xem PHASE 05).

Không chuyển sang implementation ở phase này.
