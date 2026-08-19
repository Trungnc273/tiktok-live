# Prompt 03 — System Architecture

Đọc:

- `docs/project/PROJECT_CONTEXT.md`
- `docs/research/*`
- `docs/product/PRD.md`

Bạn đang ở PHASE 03.

Thiết kế architecture có khả năng chạy MVP nhưng có đường nâng cấp thành SaaS.

## Nguyên tắc

MVP không được over-engineering.

Ưu tiên:

- Modular Monolith
- Clear boundaries
- Event-driven internal architecture
- Queue cho các tác vụ async
- WebSocket cho realtime
- PostgreSQL
- Redis nếu cần.

Không được tự động tách microservice nếu chưa có lý do.

## Architecture phải bao gồm

```text
TikTok
 ↓
TikTok Adapter
 ↓
Event Normalizer
 ↓
Internal Event Bus
 ↓
Rule Engine
 ↓
Action Dispatcher
 ↓
 ├── TTS
 ├── Audio
 ├── Overlay
 ├── WebSocket
 └── OBS
```

## Cần thiết kế

- Component architecture
- Module boundaries
- Data flow
- Event schema
- Rule schema
- Action schema
- Database ERD
- WebSocket architecture
- Queue architecture
- Error handling
- Retry strategy
- Idempotency
- Rate limiting
- Logging
- Security
- Configuration
- Observability.

## Output

Tạo:

`docs/architecture/SYSTEM-ARCHITECTURE.md`

`docs/architecture/EVENT-MODEL.md`

`docs/architecture/RULE-ENGINE.md`

`docs/architecture/DATABASE-DESIGN.md`

`docs/architecture/REALTIME-ARCHITECTURE.md`

`docs/reports/PHASE-03-REPORT.md`

Không code.

Dừng.
