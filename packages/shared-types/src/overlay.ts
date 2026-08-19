import { z } from "zod";
import { liveEventSchema } from "./live-event.js";

// Xem docs/architecture/REALTIME-ARCHITECTURE.md — message gửi qua Socket.IO tới overlay/dashboard.

export const overlayMessageSchema = z.object({
  sequence: z.number(),
  type: z.enum(["liveEvent", "soundReady", "ttsReady"]),
  data: z.unknown(),
});
export type OverlayMessage = z.infer<typeof overlayMessageSchema>;

export const overlayLiveEventMessageSchema = overlayMessageSchema.extend({
  type: z.literal("liveEvent"),
  data: liveEventSchema,
});
