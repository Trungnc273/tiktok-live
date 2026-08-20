# tiktok-live

TikTok LIVE Automation Platform — nghe sự kiện live TikTok thật (follow/like/comment/share/gift) và tự động phản ứng (TTS, sound, overlay hiệu ứng) theo rule người dùng tự cấu hình, không cần biết code.

## Monorepo

- `apps/server` — Node.js/TypeScript + Fastify + Socket.IO + PostgreSQL (Drizzle ORM)
- `apps/dashboard` — React + Vite, quản lý automation, đăng nhập, admin
- `apps/overlay` — React + Vite, trang hiệu ứng mở trên OBS Browser Source hoặc điện thoại thứ 2
- `packages/shared-types` — type/schema dùng chung (Zod)

## Chạy dev

```bash
docker compose up -d          # Postgres
cp .env.example apps/server/.env   # điền JWT_SECRET, v.v.
npm install
npm run db:migrate --workspace=apps/server
npm run dev --workspace=apps/server
```

Xem thêm tài liệu kiến trúc/thiết kế trong `docs/`.
