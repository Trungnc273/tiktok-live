import { liveEventSchema, type LiveEvent } from "@tiktok-live/shared-types";
import type { AdapterEvent } from "../tiktok-adapter/types.js";
import { normalizeAdapterEvent } from "./normalize.js";

export { normalizeAdapterEvent } from "./normalize.js";
export { extractUser, type NormalizedUser } from "./user-extractor.js";
export { sanitizeText } from "./sanitize.js";

export interface NormalizeResult {
  ok: boolean;
  event?: LiveEvent;
  error?: string;
}

/**
 * Chuyển AdapterEvent thành LiveEvent VÀ validate bằng Zod trước khi cho phép
 * phát lên event-bus (docs/architecture/EVENT-MODEL.md — Validation).
 * Event không hợp lệ → trả ok:false, KHÔNG throw (không được làm chết pipeline).
 */
export function normalizeAndValidate(event: AdapterEvent, streamId: string): NormalizeResult {
  try {
    const candidate = normalizeAdapterEvent(event, streamId);
    const parsed = liveEventSchema.safeParse(candidate);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message };
    }
    return { ok: true, event: parsed.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
