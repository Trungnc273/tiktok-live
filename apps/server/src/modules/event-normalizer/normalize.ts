import { randomUUID } from "node:crypto";
import type { LiveEvent } from "@tiktok-live/shared-types";
import type { AdapterEvent } from "../tiktok-adapter/types.js";
import { extractUser } from "./user-extractor.js";
import { sanitizeText } from "./sanitize.js";

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

function baseFields(streamId: string) {
  return {
    schemaVersion: 1 as const,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    streamId,
  };
}

export function normalizeAdapterEvent(event: AdapterEvent, streamId: string): LiveEvent {
  const base = baseFields(streamId);
  // event.data có thể là null/undefined nếu thư viện gửi payload rỗng — fallback về {}
  // để các case bên dưới không throw khi truy cập property (defensive, không tin dữ liệu vào).
  const safeData = (event.data ?? {}) as object;

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
