# TIKTOK-LIVE-SOURCES.md

## Official sources (TikTok chính thức)

| Nguồn | Loại | Ghi chú |
|---|---|---|
| [developers.tiktok.com](https://developers.tiktok.com/) | Official portal | Liệt kê toàn bộ sản phẩm API chính thức: Login Kit, Share Kit, Content Posting API, Display API, Research API, Data Portability API, Embed Videos, Green Screen Kit, Commercial Content API. **Không có sản phẩm nào cho LIVE streaming events** (follow/like/comment/gift). |
| [TikTok Developer Terms of Service](https://www.tiktok.com/legal/page/global/tik-tok-developer-terms-of-service/en) | Official legal | Cấm rõ: reverse engineer, decompile, scrape, dùng automated means để truy cập TikTok Services mà không có uỷ quyền bằng văn bản. |
| [TikTok Terms of Service](https://www.tiktok.com/legal/page/global/terms-of-service/en) | Official legal | Điều khoản chung, áp dụng cho end-user và gián tiếp cho sản phẩm bên thứ ba khai thác dữ liệu. |

**Kết luận từ nguồn chính thống**: không tìm thấy tài liệu chính thức nào (API doc, webhook doc, developer guide) cho phép bên thứ ba tự đăng ký (self-serve) để nhận realtime LIVE events như Follow/Like/Comment/Gift.

## Unofficial / community sources (KHÔNG phải nguồn chính thức của TikTok)

> Toàn bộ mục này là reverse-engineered / community-maintained. Không đại diện cho TikTok, không có bảo đảm hợp đồng nào từ TikTok.

| Project | Ngôn ngữ | Sao (ước lượng tại thời điểm research) | Ghi chú |
|---|---|---|---|
| [zerodytrash/TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) | Node.js/TypeScript | ~2.1k sao, 462 fork, cập nhật đều | Thư viện phổ biến nhất, đọc trực tiếp Webcast push service của TikTok. Cần dịch vụ ký request (mặc định Euler Stream). License: **AGPL sửa đổi**, hạn chế dùng thương mại. Tự nhận "không phải API production-ready". |
| [isaackogan/TikTokLive](https://github.com/isaackogan/TikTokLive) | Python | Cùng hệ sinh thái tác giả với bản TS | Bản Python tương đương. |
| [jwdeveloper/TikTokLiveJava](https://github.com/jwdeveloper/TikTokLiveJava) | Java | — | Port Java. |
| [EulerStream](https://www.eulerstream.com/) | Dịch vụ SaaS (không phải của TikTok) | — | Dịch vụ ký request bắt buộc để các thư viện trên hoạt động ổn định lâu dài. Free tier: 2.500 request/ngày, 25 cloud WebSocket, 5 LIVE alerts. Có gói trả phí (Business từ $50/tháng). |
| [onykage/tiktok-live-toolkit](https://github.com/onykage/tiktok-live-toolkit) | Node.js | 2 commit, 0 sao | Toolkit trọn gói (event bus + trigger + overlay + Discord bot). Quá non trẻ, không dùng làm nền tảng. |
| [funtart/TikTokOBS](https://github.com/funtart/TikTokOBS), [alexlobaza/TikTokStreamingToolkit](https://github.com/alexlobaza/TikTokStreamingToolkit), [ugurtas/tiktok-live-gift-alert-obs](https://github.com/ugurtas/tiktok-live-gift-alert-obs) | Node.js | nhỏ, cộng đồng | Chỉ tham khảo cách hiển thị overlay OBS qua browser source, không dùng làm core.

## Phân loại rõ ràng

- **Official TikTok API**: Login Kit, Share Kit, Content Posting API, Display API, Research API, Data Portability API, Embed Videos, Green Screen Kit, Commercial Content API. Không có API LIVE event.
- **Unofficial / community library**: mọi thư viện đọc Webcast push service (TikTok-Live-Connector và các bản port) — đây là nhóm duy nhất có khả năng lấy được Follow/Like/Comment/Gift realtime tại thời điểm research (2026-08).
