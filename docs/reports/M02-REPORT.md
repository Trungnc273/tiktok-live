# M02-REPORT.md — Event Normalizer

## Implemented

- `apps/server/src/modules/event-normalizer/`:
  - `user-extractor.ts` — `extractUser()` tra theo thứ tự ưu tiên nhiều field ứng viên (`uniqueId`, `displayId`, `nickname`, `id`) thay vì tin 1 field cố định.
  - `sanitize.ts` — `sanitizeText()` loại control character khỏi text thô (comment).
  - `normalize.ts` — `normalizeAdapterEvent()`: map 7 event type đã forward ở M01 (`chat`, `gift`, `like`, `follow`, `share`, `member`, `roomUser`) sang `LiveEvent` theo `EVENT-MODEL.md`; event không map được → `type: "unknown"`, không throw.
  - `index.ts` — `normalizeAndValidate()`: gọi normalize + validate bằng Zod (`liveEventSchema`), trả `{ ok, event | error }`, không bao giờ throw ra ngoài.
- Nối vào `apps/server/src/main.ts`: raw `AdapterEvent` từ `tiktok-adapter` (M01) được normalize + validate + log ngay trong pipeline thật.

## Event types

Đúng 6 loại đã được PHASE 01 xác nhận khả dụng (`follow`, `like`, `comment`, `share`, `gift`, `join`) + `unknown` cho phần chưa map. Không tự bịa event nào ngoài phạm vi này.

**Field mapping dựa trên type proto thật** của `tiktok-live-proto/v3` (dependency của `tiktok-live-connector@2.4.4`), đọc trực tiếp từ `.d.ts` — không suy đoán từ README. Phát hiện quan trọng: README minh hoạ `user.uniqueId`, nhưng interface `User` trong proto thực tế **không có** field này (chỉ có `id`, `nickname`, `displayId`). Đây là bằng chứng cụ thể, không phải giả thuyết, cho rủi ro "tài liệu cộng đồng lệch dữ liệu thật" đã nêu ở PHASE 01/06. Xử lý bằng `extractUser()` tra nhiều field theo thứ tự ưu tiên thay vì cứng 1 field.

## Requirements

- **Stable schema**: dùng lại `LiveEvent` Zod schema từ `packages/shared-types` (đã tạo ở M01).
- **Validation**: `normalizeAndValidate()` validate bằng `liveEventSchema.safeParse` trước khi coi là hợp lệ.
- **Type safety**: toàn bộ mapping có type TypeScript tường minh (`RawGiftData`, `RawChatData`...), không dùng `any` tràn lan.
- **Unit tests**: 10 test trong `normalize.test.ts` — bao phủ cả 6 loại event + unknown event + user thiếu hoàn toàn + data `null` (defensive).
- **Unknown event handling**: event không map được → `type: "unknown"`, giữ `originalType` + `raw` để debug, không throw.
- **Versioning strategy**: `schemaVersion: 1` (kế thừa từ `EVENT-MODEL.md`), chưa cần tăng version ở milestone này.

## Actual test result

```text
Test Files  2 passed (2)
     Tests  16 passed (16)   (6 từ M01 + 10 từ M02)
```

`npm run typecheck` và `npm run build` chạy sạch sau khi nối `event-normalizer` vào `main.ts`.

## Sự cố phát hiện và xử lý trong lúc code (không phải giả thuyết)

1. **File `sanitize.ts` bị công cụ ghi file chèn nhầm byte điều khiển thật** (thay vì chuỗi escape `\x00-\x1f`) trong lần viết đầu — quét toàn bộ file nguồn bằng script phát hiện đúng 1 file bị ảnh hưởng, đã sửa bằng cách dựng regex qua `new RegExp("[\\x00-\\x1f\\x7f]", "g")` thay vì regex literal, tránh phụ thuộc ký tự thô trong source. Đã quét lại toàn repo xác nhận sạch.
2. Cùng sự cố công cụ khiến 1 test ban đầu chứa input `"hello world"` bị chèn byte NUL thay cho khoảng trắng — sửa trực tiếp bằng script, xác nhận lại bằng scan byte-level.
3. `normalizeAdapterEvent` ban đầu throw khi `event.data` là `null` (ví dụ `data.gift?.id` khi `data` chính nó là `null`) — dù được `normalizeAndValidate` bắt lỗi (không crash pipeline), đây vẫn là hành vi kém rõ ràng. Đã sửa tận gốc: `const safeData = (event.data ?? {}) as object` áp dụng cho mọi case, không còn dựa vào try/catch làm lưới an toàn duy nhất.
4. Mock event mẫu trong `main.ts` (từ M01) dùng field `comment` — sai so với field thật `content` của `WebcastChatMessage` — sửa lại cho đúng, xác nhận qua chạy `main.ts` thật thấy `payload.text` nhận đúng nội dung thay vì chuỗi rỗng.

## Report chính xác event đã test thành công

Test thành công (unit test + chạy thật qua mock, **chưa** có dữ liệu TikTok thật):

- `comment` (từ `chat`) ✅
- `gift` (kèm streak end, diamond value) ✅
- `like` (kèm total) ✅
- `follow` ✅
- `share` ✅
- `join` (từ `member` và `roomUser`, kèm viewerCount) ✅
- `unknown` fallback ✅

**Chưa test** với payload thật từ TikTok LIVE — toàn bộ field mapping ở trên dựa trên type proto tĩnh, chưa có xác nhận runtime (kế thừa giới hạn đã nêu ở M01-REPORT.md).

## Next step

M03 — Event storage/logging: lưu `LiveEvent` (đã chuẩn hoá + validate ở M02) vào Postgres (`events_log`, `stream_sessions`) theo `DATABASE-DESIGN.md`.
