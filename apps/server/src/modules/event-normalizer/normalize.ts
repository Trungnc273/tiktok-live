import { v5 as uuidv5 } from "uuid";
import type { LiveEvent } from "@tiktok-live/shared-types";
import type { AdapterEvent } from "../tiktok-adapter/types.js";
import { extractUser } from "./user-extractor.js";
import { sanitizeText } from "./sanitize.js";

/**
 * Namespace cố định cho UUID v5 (sinh 1 lần duy nhất, KHÔNG được đổi — đổi sẽ làm
 * mọi id cũ tính lại khác đi, phá vỡ idempotency đang dựa trên id này).
 */
const EVENT_ID_NAMESPACE = "6f1b1a4e-6e0f-4c1e-9d2a-8f1b0c2e5a11";

/**
 * Chuyển AdapterEvent (raw, trung lập) thành LiveEvent chuẩn hoá theo
 * docs/architecture/EVENT-MODEL.md. Đây là ranh giới duy nhất giữa
 * "thế giới thư viện unofficial" và phần còn lại của hệ thống (rule-engine,
 * action-engine không bao giờ thấy field thô của tiktok-live-connector).
 *
 * Field mapping dựa trên type proto của tiktok-live-connector@2.4.4
 * (tiktok-live-proto/v3), KHÔNG dựa trên suy đoán — nhưng CHƯA được xác nhận
 * bằng dữ liệu runtime thật (chưa có phòng LIVE thật để test, xem M01-REPORT.md).
 * Nếu M13 phát hiện field sai lệch, chỉ cần sửa các case bên dưới.
 */

interface RawGiftData {
  gift?: { id?: unknown; name?: unknown; diamondCount?: unknown };
  giftId?: unknown;
  repeatCount?: unknown;
  groupCount?: unknown;
  repeatEnd?: unknown;
  user?: unknown;
}

interface RawLikeData {
  count?: unknown;
  total?: unknown;
  user?: unknown;
}

interface RawChatData {
  content?: unknown;
  user?: unknown;
}

interface RawSocialData {
  user?: unknown;
}

interface RawMemberData {
  user?: unknown;
  memberCount?: unknown;
}

interface RawRoomUserData {
  totalUser?: unknown;
  user?: unknown;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Sinh id DETERMINISTIC cho cùng 1 sự kiện thật — đúng thiết kế EVENT-MODEL.md
 * ("id sinh tại lúc normalize, deterministic theo nguồn nếu thư viện cung cấp
 * event id gốc; nếu không có, dùng hash(type+user+timestamp+payload cơ bản)").
 *
 * Trước đây dùng randomUUID() (id ngẫu nhiên mỗi lần gọi) — phát hiện ở PHASE 14
 * audit (H1): làm mất khả năng chống trùng khi thư viện TikTok gửi lặp 1 event
 * (ví dụ khi reconnect/replay buffer), vì idempotency ở Action Engine (M05) dựa
 * trên event_id — 2 lần normalize cùng 1 event thật trước đây tạo ra 2 id khác
 * nhau, khiến TTS/action có thể chạy 2 lần cho cùng 1 tương tác.
 *
 * Ưu tiên `common.msgId` (có trên hầu hết message type theo CommonMessageData
 * trong tiktok-live-proto/v3) — deterministic tuyệt đối theo nguồn. Nếu vắng mặt,
 * fallback hash theo (eventName + user + toàn bộ payload) — KHÔNG bao gồm thời
 * điểm nhận (receivedAt), vì 2 lần gửi lặp cùng nội dung có thể đến ở 2 thời điểm
 * khác nhau; bao gồm receivedAt sẽ vô hiệu hoá chính mục đích chống trùng.
 */
function deriveEventId(eventName: string, safeData: object): string {
  const common = (safeData as { common?: { msgId?: unknown } }).common;
  if (common && typeof common.msgId === "string" && common.msgId.length > 0) {
    return uuidv5(`${eventName}:${common.msgId}`, EVENT_ID_NAMESPACE);
  }

  const fallbackKey = `${eventName}:${JSON.stringify(safeData)}`;
  return uuidv5(fallbackKey, EVENT_ID_NAMESPACE);
}

function baseFields(streamId: string, id: string) {
  return {
    schemaVersion: 1 as const,
    id,
    timestamp: new Date().toISOString(),
    streamId,
  };
}

export function normalizeAdapterEvent(event: AdapterEvent, streamId: string): LiveEvent {
  // event.data có thể là null/undefined nếu thư viện gửi payload rỗng — fallback về {}
  // để các case bên dưới không throw khi truy cập property (defensive, không tin dữ liệu vào).
  const safeData = (event.data ?? {}) as object;
  const base = baseFields(streamId, deriveEventId(event.name, safeData));

  switch (event.name) {
    case "chat": {
      const data = safeData as RawChatData;
      return {
        ...base,
        type: "comment",
        user: extractUser(data.user),
        payload: { text: sanitizeText(String(data.content ?? "")) },
      };
    }

    case "gift": {
      const data = safeData as RawGiftData;
      return {
        ...base,
        type: "gift",
        user: extractUser(data.user),
        payload: {
          giftId: String(data.gift?.id ?? data.giftId ?? "unknown"),
          giftName: String(data.gift?.name ?? "unknown"),
          count: toNumber(data.repeatCount ?? data.groupCount, 1),
          diamondValue:
            data.gift?.diamondCount !== undefined ? toNumber(data.gift.diamondCount) : undefined,
          // repeatEnd === 1 báo hiệu kết thúc streak (theo tài liệu cộng đồng đã research
          // ở PHASE 01 — CHƯA xác nhận bằng dữ liệu thật, xem ghi chú đầu file).
          isStreakEnd: toNumber(data.repeatEnd) === 1,
        },
      };
    }

    case "like": {
      const data = safeData as RawLikeData;
      return {
        ...base,
        type: "like",
        user: extractUser(data.user),
        payload: {
          count: toNumber(data.count, 1),
          totalLikeCount: data.total !== undefined ? toNumber(data.total) : undefined,
        },
      };
    }

    case "follow": {
      const data = safeData as RawSocialData;
      return { ...base, type: "follow", user: extractUser(data.user), payload: {} };
    }

    case "share": {
      const data = safeData as RawSocialData;
      return { ...base, type: "share", user: extractUser(data.user), payload: {} };
    }

    case "member": {
      const data = safeData as RawMemberData;
      return {
        ...base,
        type: "join",
        user: extractUser(data.user),
        payload: {
          viewerCount: data.memberCount !== undefined ? toNumber(data.memberCount) : undefined,
        },
      };
    }

    case "roomUser": {
      // Sự kiện tổng hợp viewer count định kỳ, không gắn với 1 user cụ thể —
      // dùng extractUser(undefined) -> "unknown" một cách có chủ đích.
      const data = safeData as RawRoomUserData;
      return {
        ...base,
        type: "join",
        user: extractUser(data.user),
        payload: {
          viewerCount: data.totalUser !== undefined ? toNumber(data.totalUser) : undefined,
        },
      };
    }

    default:
      return {
        ...base,
        type: "unknown",
        user: extractUser(undefined),
        payload: { originalType: event.name, raw: event.data },
      };
  }
}
