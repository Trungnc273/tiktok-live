# PROJECT_CONTEXT.md

> Tạo ở PHASE 00 — Project Initialization. Không chứa implementation, không giả định điều chưa kiểm chứng.

## Project overview

Xây dựng **TikTok LIVE Automation Platform**: nhận realtime event từ TikTok LIVE (Follow, Like, Comment, Share, Gift, Join...), chuẩn hóa event, cho phép người dùng định nghĩa rule dạng `WHEN event/condition → THEN action(s)` (TTS, sound, video, animation, overlay, WebSocket, OBS, webhook, game integration trong tương lai), có dashboard quản lý automation và realtime monitoring.

## Goals

- Nhận và chuẩn hóa realtime event từ TikTok LIVE.
- Cho phép tạo automation rule không cần code (dành cho streamer không phải lập trình viên).
- Kích hoạt được TTS, âm thanh, overlay, WebSocket khi rule khớp.
- Có dashboard quản lý.
- Kiến trúc có đường nâng cấp lên SaaS đa người dùng (không bắt buộc MVP phải multi-tenant).

## Non-goals (ở giai đoạn hiện tại)

- Không xây multi-tenant/billing/SaaS đầy đủ ở MVP.
- Không tích hợp game trong MVP (chỉ để chỗ mở rộng).
- Không cam kết uptime/SLA production ở giai đoạn nghiên cứu.

## Current repository structure

Repo hiện tại **trống hoàn toàn**, chưa có source code. Duy nhất tồn tại:

```text
docs/
  promp/
    promp_overall.md
    PHASE_0.md ... PHASE_15.md
```

Không có `package.json`, không có thư mục `src/`, không có config nào khác.

## Existing technology

- **Không có** tech stack nào đã được thiết lập trong repo — đây là dự án khởi tạo từ đầu.
- Môi trường máy phát triển (không phải là quyết định kiến trúc, chỉ là thông tin máy local): Node.js v22.19.0, npm v10.9.3 có sẵn trên máy.
- Không có Docker, không có CI/CD, không có database, không có testing framework nào được cấu hình.

## Development conventions

`UNKNOWN` — chưa có code nào để suy ra convention. Sẽ được quyết định ở PHASE 03 (Architecture) khi chọn tech stack chính thức.

## Known constraints

- Đây là dự án cá nhân/nhỏ ở giai đoạn đầu, không phải hệ thống production có sẵn cần tương thích ngược.
- Repo chưa được khởi tạo bằng git (`git status` báo "not a git repository").
- TikTok không có API public chính thức, tự-phục-vụ (self-serve) cho toàn bộ các LIVE event mà sản phẩm cần (Follow/Like/Comment/Gift realtime) — xác nhận chi tiết sẽ do PHASE 01 thực hiện; đây là constraint đã biết trước cần PHASE 01 kiểm chứng và định lượng rủi ro.

## Open questions

1. Tech stack chính thức (ngôn ngữ, framework backend/frontend) — chưa chọn, để PHASE 03 quyết định dựa trên PHASE 01 (research khả năng kỹ thuật, ví dụ thư viện TikTok LIVE tốt nhất theo ngôn ngữ nào).
2. TTS provider cụ thể — chưa chọn, dự kiến quyết định ở PHASE 09.
3. Database engine cụ thể (dự kiến PostgreSQL theo định hướng PHASE 03, nhưng chưa xác nhận).
4. Có cần multi-user/auth ngay từ MVP hay để Phase 2/Future — chưa chốt, chờ PHASE 02 (PRD) phân loại.

## RESEARCH_REQUIRED

- Toàn bộ nội dung PHASE 01: TikTok LIVE official API có tồn tại/khả dụng cho các event nào, unofficial library nào đáng tin cậy nhất, rủi ro pháp lý/kỹ thuật khi dùng unofficial library cho sản phẩm có định hướng SaaS.

## Initial risks

- **Rủi ro nền tảng cao nhất**: nhiều khả năng không có official API cho phần lớn LIVE event cần dùng (Follow/Like/Comment/Gift) → phải phụ thuộc thư viện unofficial reverse-engineered, có thể bị TikTok thay đổi/chặn bất cứ lúc nào, và có ràng buộc license (ví dụ AGPL) hạn chế dùng thương mại. Sẽ được định lượng chính xác ở PHASE 01.
- Chưa có tech stack nên mọi ước lượng effort ở giai đoạn này đều mang tính sơ bộ.
- Mục tiêu dài hạn "SaaS nhiều người dùng" có thể xung đột với rủi ro dùng thư viện unofficial (ổn định, pháp lý) — cần PRD (PHASE 02) nêu rõ risk này thay vì né tránh.
