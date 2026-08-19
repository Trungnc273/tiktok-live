import { z } from "zod";

// Xem docs/architecture/EVENT-MODEL.md — nguồn sự thật cho schema này.

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  nickname: z.string().optional(),
  profilePictureUrl: z.string().optional(),
});

const baseFields = {
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  timestamp: z.string(),
  streamId: z.string(),
  user: userSchema,
};

export const followEventSchema = z.object({
  ...baseFields,
  type: z.literal("follow"),
  payload: z.object({}).strict(),
});

export const likeEventSchema = z.object({
  ...baseFields,
  type: z.literal("like"),
  payload: z.object({
    count: z.number(),
    totalLikeCount: z.number().optional(),
  }),
});

export const commentEventSchema = z.object({
  ...baseFields,
  type: z.literal("comment"),
  payload: z.object({
    text: z.string(),
  }),
});

export const shareEventSchema = z.object({
  ...baseFields,
  type: z.literal("share"),
  payload: z.object({}).strict(),
});

export const giftEventSchema = z.object({
  ...baseFields,
  type: z.literal("gift"),
  payload: z.object({
    giftId: z.string(),
    giftName: z.string(),
    count: z.number(),
    diamondValue: z.number().optional(),
    isStreakEnd: z.boolean(),
  }),
});

export const joinEventSchema = z.object({
  ...baseFields,
  type: z.literal("join"),
  payload: z.object({
    viewerCount: z.number().optional(),
  }),
});

export const unknownEventSchema = z.object({
  ...baseFields,
  type: z.literal("unknown"),
  payload: z.object({
    originalType: z.string(),
    raw: z.unknown().optional(),
  }),
});

export const liveEventSchema = z.discriminatedUnion("type", [
  followEventSchema,
  likeEventSchema,
  commentEventSchema,
  shareEventSchema,
  giftEventSchema,
  joinEventSchema,
  unknownEventSchema,
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;
export type FollowEvent = z.infer<typeof followEventSchema>;
export type LikeEvent = z.infer<typeof likeEventSchema>;
export type CommentEvent = z.infer<typeof commentEventSchema>;
export type ShareEvent = z.infer<typeof shareEventSchema>;
export type GiftEvent = z.infer<typeof giftEventSchema>;
export type JoinEvent = z.infer<typeof joinEventSchema>;
export type UnknownEvent = z.infer<typeof unknownEventSchema>;

export type LiveEventType = LiveEvent["type"];
