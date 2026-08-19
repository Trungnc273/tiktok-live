/**
 * Trích thông tin user từ payload thô của thư viện.
 *
 * GHI CHÚ QUAN TRỌNG: README của tiktok-live-connector minh hoạ `user.uniqueId`,
 * nhưng type proto thực tế (`tiktok-live-proto/v3`, package phụ thuộc của
 * tiktok-live-connector@2.4.4) KHÔNG có field `uniqueId` trên interface `User` —
 * chỉ có `id`, `nickname`, `displayId`. Đây là bằng chứng cụ thể cho rủi ro đã nêu ở
 * PHASE 01/PHASE 06: tài liệu cộng đồng có thể lệch so với dữ liệu thật.
 *
 * Chưa có phòng LIVE thật để quan sát payload runtime thực tế (xem M01-REPORT.md).
 * Vì vậy hàm này tra theo THỨ TỰ ưu tiên nhiều field ứng viên thay vì tin 1 field cố
 * định — để không vỡ khi field thực tế khác README. Đây là quyết định phòng thủ có
 * chủ đích, không phải đoán mò: nếu M13 (E2E test với TikTok thật) phát hiện field
 * đúng là khác, chỉ cần sửa thứ tự ưu tiên tại đây, không phải sửa toàn bộ pipeline.
 */

interface RawUserLike {
  id?: unknown;
  userId?: unknown;
  uniqueId?: unknown;
  displayId?: unknown;
  nickname?: unknown;
  avatarThumb?: { urlList?: unknown[] } | null;
  profilePictureUrl?: unknown;
}

export interface NormalizedUser {
  id: string;
  username: string;
  nickname?: string;
  profilePictureUrl?: string;
}

const UNKNOWN_USER: NormalizedUser = { id: "unknown", username: "unknown" };

function firstNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

export function extractUser(raw: unknown): NormalizedUser {
  if (!raw || typeof raw !== "object") return UNKNOWN_USER;
  const user = raw as RawUserLike;

  const id = firstNonEmptyString(user.id, user.userId) ?? "unknown";
  const username =
    firstNonEmptyString(user.uniqueId, user.displayId, user.nickname, user.id) ?? "unknown";
  const nickname = firstNonEmptyString(user.nickname);
  const profilePictureUrl =
    firstNonEmptyString(user.profilePictureUrl) ??
    (Array.isArray(user.avatarThumb?.urlList)
      ? firstNonEmptyString(...(user.avatarThumb?.urlList ?? []))
      : undefined);

  return { id, username, nickname, profilePictureUrl };
}
