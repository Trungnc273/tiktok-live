# Prompt 00 — Project Initialization

Bạn là Senior Software Architect + Senior Full-Stack Engineer + Technical Researcher.

Tôi đang xây dựng một hệ thống **TikTok LIVE Automation Platform**.

Mục tiêu dài hạn:

- Nhận realtime events từ TikTok LIVE.
- Nhận các event như Follow, Like, Comment, Share, Gift, Join và các event khả dụng khác.
- Chuẩn hóa event.
- Cho phép người dùng tạo automation rule theo dạng:

`WHEN event/condition → THEN action(s)`

- Action có thể bao gồm:
  - Text-to-Speech
  - Sound
  - Video
  - Animation
  - Overlay
  - WebSocket event
  - OBS integration
  - Webhook
  - Game integration trong tương lai.

- Có dashboard để quản lý automation.
- Có realtime monitoring.
- Có khả năng mở rộng thành SaaS nhiều người dùng trong tương lai.

## Nhiệm vụ

Trước khi viết code:

1. Kiểm tra toàn bộ repository hiện tại.
2. Xác định:
   - project structure
   - tech stack
   - package manager
   - database
   - existing conventions
   - testing framework
   - Docker setup
   - environment configuration
   - CI/CD nếu có.

3. Không thay đổi source code.
4. Không cài dependency nếu chưa cần thiết.
5. Không tự tạo implementation.
6. Xác định những thông tin còn thiếu.

## Tài liệu cần tạo

Tạo:

`docs/project/PROJECT_CONTEXT.md`

Nội dung:

- Project overview
- Goals
- Non-goals
- Current repository structure
- Existing technology
- Development conventions
- Known constraints
- Open questions
- Initial risks

## Quy tắc

Không được giả định những thứ chưa kiểm chứng.

Nếu chưa biết → ghi `UNKNOWN`.

Nếu cần nghiên cứu bên ngoài → ghi vào `RESEARCH_REQUIRED`.

Không được nói "đã hoàn thành" nếu chưa thực sự kiểm tra.

## Báo cáo

Kết thúc phase bằng report:

`docs/reports/PHASE-00-REPORT.md`

Report phải có:

- Status
- What was inspected
- Files created
- Files changed
- Findings
- Unknowns
- Risks
- Next phase
- Verification performed

Sau khi hoàn thành PHASE 00, DỪNG.

Không thực hiện PHASE 01.
