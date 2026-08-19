# EVENT-MODEL.md

> Event schema nội bộ, độc lập với thư viện TikTok unofficial. Chỉ các event đã được `TIKTOK-LIVE-CAPABILITY.md` xác nhận khả dụng mới có mặt ở đây — không bịa event.

## Nguyên tắc

- `tiktok-adapter` nhận raw event từ thư viện → `event-normalizer` chuyển thành `LiveEvent` chuẩn hoá dưới đây.
- Không module nào ngoài `tiktok-adapter` + `event-normalizer` được thấy raw object của thư viện.
- Schema có `schemaVersion` để hỗ trợ versioning khi cần đổi cấu trúc sau này.

## LiveEvent (base)

```typescript
interface LiveEventBase {
  schemaVersion: 1;
  id: string;               // UUID, sinh tại lúc normalize (xem Idempotency ở SYSTEM-ARCHITECTURE.md)
  type: LiveEventType;
  timestamp: string;        // ISO 8601, giờ nhận được tại server (không tin timestamp thô từ client TikTok)
  streamId: string;         // định danh phiên live hiện tại (session id nội bộ, không phải id của TikTok)
  user: {
    id: string;              // id người dùng TikTok nếu thư viện cung cấp, fallback username nếu không có id ổn định
    username: string;
    nickname?: string;
    profilePictureUrl?: string;
  };
}

type LiveEventType =
  | "follow"
  | "like"
  | "comment"
  | "share"
  | "gift"
  | "join"
  | "unknown";
```

## Payload theo từng loại (MVP — khớp FR-1 → FR-6 của PRD)

```typescript
interface FollowEvent extends LiveEventBase {
  type: "follow";
  payload: Record<string, never>; // không có dữ liệu thêm
}

interface LikeEvent extends LiveEventBase {
  type: "like";
  payload: {
    count: number;        // số like trong lần push này (TikTok gộp like theo batch)
    totalLikeCount?: number; // tổng like của phiên live nếu thư viện cung cấp
  };
}

interface CommentEvent extends LiveEventBase {
  type: "comment";
  payload: {
    text: string;          // đã qua bước sanitize cơ bản (loại control character), CHƯA escape cho từng nơi hiển thị — nơi tiêu thụ (TTS, overlay) tự escape theo ngữ cảnh
  };
}

interface ShareEvent extends LiveEventBase {
  type: "share";
  payload: Record<string, never>;
}

interface GiftEvent extends LiveEventBase {
  type: "gift";
  payload: {
    giftId: string;
    giftName: string;
    count: number;         // số lượng trong streak hiện tại
    diamondValue?: number; // giá trị quy đổi diamond nếu thư viện cung cấp
    isStreakEnd: boolean;  // đúng theo cơ chế streak gift của TikTok — chỉ nên trigger action khi streak kết thúc, trừ khi rule cố ý muốn phản ứng theo từng lần
  };
}

interface JoinEvent extends LiveEventBase {
  type: "join";
  payload: {
    viewerCount?: number;  // tổng viewer hiện tại nếu thư viện cung cấp kèm event join
  };
}
```

## Unknown event handling

```typescript
interface UnknownEvent extends LiveEventBase {
  type: "unknown";
  payload: {
    originalType: string;   // tên event gốc từ thư viện, để debug
    raw?: unknown;           // chỉ lưu ở log debug, KHÔNG đưa vào rule-engine/action-engine
  };
}
```

- Mọi event mà `event-normalizer` chưa có mapping rõ ràng → chuyển thành `UnknownEvent`, ghi log để sau này xem xét bổ sung (ví dụ Subscribe/PK ở Phase 2), **không throw lỗi làm chết pipeline**.
- `UnknownEvent` vẫn phát ra `event-bus` để phục vụ debug/log, nhưng `rule-engine` mặc định bỏ qua `type: "unknown"` (không cho phép user tạo trigger match "unknown" ở MVP).

## Validation

- Toàn bộ `LiveEvent` được validate bằng Zod schema tương ứng (`packages/shared-types`) trước khi phát lên `event-bus`. Event không hợp lệ (thiếu field bắt buộc) → log lỗi + drop, không phát ra bus (tránh rule-engine crash vì thiếu field).

## Versioning strategy

- `schemaVersion` tăng khi có breaking change cấu trúc field (ví dụ đổi tên field, đổi kiểu dữ liệu).
- Consumer (rule-engine, action-engine, overlay) chỉ cam kết hỗ trợ `schemaVersion` hiện tại; khi tăng version, thêm adapter chuyển đổi ngắn hạn nếu cần tương thích ngược cho automation cũ đã lưu trong DB (rule cũ tham chiếu field theo version cũ).

## Event nào KHÔNG có trong MVP

Theo đúng phân loại PRD (`FR-7`, `FR-8`): Subscribe/Super Fan và PK/Battle **chưa** có schema chính thức ở MVP — nếu thư viện gửi các event này, chúng rơi vào `UnknownEvent` cho tới khi được thiết kế chính thức ở Phase 2/Future.
