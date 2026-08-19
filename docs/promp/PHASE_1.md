# Prompt 01 — TikTok LIVE Research

Đọc:

`docs/project/PROJECT_CONTEXT.md`

Bạn đang ở PHASE 01.

Mục tiêu của phase này là **nghiên cứu khả năng kỹ thuật của TikTok LIVE**, chưa triển khai application.

## Nhiệm vụ

Nghiên cứu từ nguồn chính thống và nguồn kỹ thuật đáng tin cậy:

### Official sources

Ưu tiên:

- TikTok for Developers
- TikTok API documentation
- TikTok Developer Guidelines
- TikTok Terms / Developer Terms
- TikTok Webhooks
- TikTok LIVE-related documentation nếu có.

### Open-source / technical sources

Nghiên cứu các project liên quan tới:

- TikTok LIVE event listener
- TikTok LIVE WebSocket
- TikTok LIVE event parser
- Node.js TikTok LIVE libraries
- Python TikTok LIVE libraries
- OBS integrations.

## Phải xác định

1. TikTok chính thức cung cấp những LIVE event nào?
2. Event nào có thể lấy realtime?
3. Follow có lấy được không?
4. Like có lấy được không?
5. Comment có lấy được không?
6. Share có lấy được không?
7. Gift có lấy được không?
8. Join/viewer event có lấy được không?
9. Subscription/member event có lấy được không?
10. PK/battle event có lấy được không?
11. Có API chính thức không?
12. Có cần app review không?
13. Có OAuth không?
14. Có giới hạn quyền truy cập không?
15. Có thể dùng unofficial library không?
16. Rủi ro khi dùng unofficial library là gì?
17. Nếu làm SaaS thì rủi ro nào cần đặc biệt quan tâm?

## So sánh

Tạo bảng:

| Capability | Official | Unofficial | Difficulty | Risk |
| ---------- | -------- | ---------- | ---------- | ---- |

## Đặc biệt

Không được coi một GitHub repository là nguồn chính thức của TikTok.

Phải phân biệt rõ:

`Official TikTok API`

và

`Unofficial reverse-engineered / community library`

## Output

Tạo:

`docs/research/TIKTOK-LIVE-CAPABILITY.md`

và:

`docs/research/TIKTOK-LIVE-SOURCES.md`

và:

`docs/reports/PHASE-01-REPORT.md`

## Acceptance criteria

Research phải trả lời được:

> "Nếu hôm nay bắt đầu code, chúng ta lấy realtime TikTok LIVE event bằng cách nào?"

Nếu câu trả lời chưa chắc chắn, phải ghi rõ uncertainty.

Không được tự chuyển sang implementation.

Dừng sau khi report hoàn thành.
