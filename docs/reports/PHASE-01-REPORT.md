# PHASE-01-REPORT.md

## Status

DONE.

## What was inspected

- Cổng chính thức developers.tiktok.com (fetch trực tiếp) để liệt kê toàn bộ sản phẩm API official.
- TikTok Developer Terms of Service và Terms of Service chính thức (qua web search + trích dẫn) để xác định điều khoản về reverse engineering/scraping.
- Các thư viện unofficial phổ biến: TikTok-Live-Connector (Node/TS), TikTokLive (Python), TikTokLiveJava, và dịch vụ ký request Euler Stream (pricing, rate limit free tier).
- Các dự án overlay/toolkit cộng đồng liên quan (tham khảo thêm, không phải nguồn quyết định).

## Files created

- `docs/research/TIKTOK-LIVE-CAPABILITY.md`
- `docs/research/TIKTOK-LIVE-SOURCES.md`
- `docs/reports/PHASE-01-REPORT.md`

## Files changed

Không có.

## Findings

- TikTok **không có** sản phẩm API chính thức nào cho LIVE streaming events (follow/like/comment/gift/share/join). Toàn bộ sản phẩm official (Login Kit, Share Kit, Content Posting API, Display API, Research API, Data Portability API, Embed Videos, Green Screen Kit, Commercial Content API) không liên quan tới LIVE realtime interaction.
- Cách duy nhất khả thi hiện tại để lấy các event này realtime là dùng thư viện unofficial reverse-engineered (TikTok-Live-Connector và tương đương), đọc trực tiếp Webcast push service.
- TikTok Developer ToS cấm rõ hành vi reverse engineering/automated access không được uỷ quyền — nghĩa là cách tiếp cận duy nhất khả thi về mặt kỹ thuật lại đi ngược điều khoản hợp đồng chính thức.
- Thư viện TikTok-Live-Connector phụ thuộc dịch vụ ký request bên thứ ba (Euler Stream), có free tier giới hạn (2.500 request/ngày, 25 WebSocket) và gói trả phí từ $50/tháng khi scale.
- License AGPL sửa đổi của thư viện lõi hạn chế dùng thương mại — cần xem xét kỹ nếu tiến tới SaaS thu phí.

## Unknowns

- Mức độ thực thi thực tế của TikTok đối với vi phạm ToS ở quy mô dự án cá nhân/nhỏ — không có dữ liệu công khai định lượng được (ghi UNKNOWN, không suy đoán).
- Điều khoản chi tiết đầy đủ của bản AGPL sửa đổi mà TikTok-Live-Connector áp dụng — cần đọc file LICENSE trực tiếp trong repo trước khi quyết định thương mại hóa (chưa đọc ở phase này).

## Risks

- **Rủi ro nền tảng, không thể loại bỏ**: toàn bộ khả năng lấy event realtime phụ thuộc một thư viện unofficial, không có SLA, có thể ngừng hoạt động bất cứ lúc nào nếu TikTok đổi protocol.
- Rủi ro pháp lý khi thương mại hóa (SaaS nhiều người dùng thu phí) cao hơn đáng kể so với dùng cho một streamer cá nhân/nội bộ.
- Chi phí Euler Stream tăng theo số kết nối đồng thời — cần đưa vào bài toán chi phí nếu scale.

## Next phase

PHASE 02 — Product Requirements. PRD phải phản ánh đúng các rủi ro trên (đặc biệt: không cam kết SaaS đa người dùng ổn định ở MVP; ghi rõ rủi ro phụ thuộc unofficial library trong risk section).

## Verification performed

- Fetch trực tiếp trang developers.tiktok.com để liệt kê sản phẩm official (không suy đoán từ trí nhớ).
- Đối chiếu nhiều nguồn độc lập (web search) cho thông tin về thư viện unofficial, số liệu sao/fork, rate limit Euler Stream.
- Đã phân biệt rõ Official TikTok API vs Unofficial/community library trong toàn bộ tài liệu, không coi GitHub repo là nguồn chính thức của TikTok.

---

Đã hoàn thành PHASE 01. Dừng. Không tự chuyển sang PHASE 02.
