import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Schema Postgres theo docs/architecture/DATABASE-DESIGN.md.
 *
 * Multi-tenant (bổ sung sau MVP, theo yêu cầu người dùng "chia sẻ cho người quen
 * dùng chung"): thêm bảng `users` (tài khoản đăng nhập nền tảng) + cột `ownerId`
 * trên `automations`/`stream_sessions` để cách ly dữ liệu giữa các streamer.
 *
 * LƯU Ý ĐẶT TÊN: `eventsLog.userId`/`username` là id/username của NGƯỜI XEM TIKTOK
 * (viewer gửi comment/gift...) — khác hoàn toàn với `users.id` (tài khoản đăng nhập
 * nền tảng này). Dùng `ownerId` (không phải `userId`) cho khoá tới bảng `users` để
 * tránh nhầm lẫn 2 khái niệm.
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user"), // 'admin' | 'user'
    tiktokUsername: text("tiktok_username"), // username TikTok mà user này muốn theo dõi
    disabledAt: timestamp("disabled_at", { withTimezone: true }), // admin vô hiệu hoá tài khoản
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const streamSessions = pgTable("stream_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  tiktokUsername: text("tiktok_username").notNull(),
  status: text("status").notNull(), // 'connecting' | 'live' | 'disconnected' | 'error'
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  triggerEventType: text("trigger_event_type").notNull(),
  conditions: jsonb("conditions"), // ConditionNode | null — xem RULE-ENGINE.md
  actions: jsonb("actions").notNull(), // RuleAction[] — xem RULE-ENGINE.md
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventsLog = pgTable("events_log", {
  id: uuid("id").primaryKey(), // = LiveEvent.id, sinh ở event-normalizer (M02), không defaultRandom() ở đây
  streamSessionId: uuid("stream_session_id").references(() => streamSessions.id),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  userId: text("user_id"), // id NGƯỜI XEM TIKTOK (không phải users.id nền tảng này)
  username: text("username"), // username NGƯỜI XEM TIKTOK
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionLogs = pgTable(
  "execution_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsLog.id),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id),
    actionIndex: integer("action_index").notNull(),
    actionType: text("action_type").notNull(),
    status: text("status").notNull(), // 'success' | 'failed' | 'timeout' | 'skipped'
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    // Hỗ trợ idempotency (SYSTEM-ARCHITECTURE.md): không thực thi trùng cùng 1
    // action của cùng 1 rule cho cùng 1 event.
    uniqueExecution: uniqueIndex("execution_logs_event_automation_action_idx").on(
      table.eventId,
      table.automationId,
      table.actionIndex,
    ),
  }),
);
