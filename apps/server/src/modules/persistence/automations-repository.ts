import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AutomationRule } from "@tiktok-live/shared-types";
import type { Database } from "./db.js";
import { automations } from "./schema.js";

/**
 * Mọi thao tác đều SCOPE THEO `ownerId` (docs: multi-tenant bổ sung sau MVP) — cách
 * ly hoàn toàn dữ liệu giữa các streamer dùng chung nền tảng. `get`/`update`/`delete`/
 * `duplicate` chỉ tác động tới automation thuộc đúng `ownerId` truyền vào; automation
 * của người khác coi như "không tồn tại" (trả null/false), KHÔNG trả lỗi khác biệt —
 * tránh lộ thông tin "automation này tồn tại nhưng không phải của bạn" (IDOR).
 */
export interface AutomationsRepository {
  list(ownerId: string): Promise<AutomationRule[]>;
  get(id: string, ownerId: string): Promise<AutomationRule | null>;
  create(
    ownerId: string,
    input: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">,
  ): Promise<AutomationRule>;
  update(
    id: string,
    ownerId: string,
    input: Partial<Omit<AutomationRule, "id" | "createdAt" | "updatedAt">>,
  ): Promise<AutomationRule | null>;
  delete(id: string, ownerId: string): Promise<boolean>;
  duplicate(id: string, ownerId: string): Promise<AutomationRule | null>;
}

function toRule(row: typeof automations.$inferSelect): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    priority: row.priority,
    trigger: { eventType: row.triggerEventType as AutomationRule["trigger"]["eventType"] },
    conditions: row.conditions as AutomationRule["conditions"],
    actions: row.actions as AutomationRule["actions"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createAutomationsRepository(db: Database): AutomationsRepository {
  return {
    async list(ownerId) {
      const rows = await db.select().from(automations).where(eq(automations.ownerId, ownerId));
      return rows.map(toRule);
    },

    async get(id, ownerId) {
      const [row] = await db
        .select()
        .from(automations)
        .where(and(eq(automations.id, id), eq(automations.ownerId, ownerId)));
      return row ? toRule(row) : null;
    },

    async create(ownerId, input) {
      const [row] = await db
        .insert(automations)
        .values({
          id: randomUUID(),
          ownerId,
          name: input.name,
          enabled: input.enabled,
          priority: input.priority,
          triggerEventType: input.trigger.eventType,
          conditions: input.conditions,
          actions: input.actions,
        })
        .returning();
      return toRule(row);
    },

    async update(id, ownerId, input) {
      const patch: Partial<typeof automations.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.trigger !== undefined) patch.triggerEventType = input.trigger.eventType;
      if (input.conditions !== undefined) patch.conditions = input.conditions;
      if (input.actions !== undefined) patch.actions = input.actions;

      const [row] = await db
        .update(automations)
        .set(patch)
        .where(and(eq(automations.id, id), eq(automations.ownerId, ownerId)))
        .returning();
      return row ? toRule(row) : null;
    },

    async delete(id, ownerId) {
      const result = await db
        .delete(automations)
        .where(and(eq(automations.id, id), eq(automations.ownerId, ownerId)))
        .returning({ id: automations.id });
      return result.length > 0;
    },

    async duplicate(id, ownerId) {
      const [original] = await db
        .select()
        .from(automations)
        .where(and(eq(automations.id, id), eq(automations.ownerId, ownerId)));
      if (!original) return null;
      const [row] = await db
        .insert(automations)
        .values({
          id: randomUUID(),
          ownerId,
          name: `${original.name} (copy)`,
          enabled: original.enabled,
          priority: original.priority,
          triggerEventType: original.triggerEventType,
          conditions: original.conditions,
          actions: original.actions,
        })
        .returning();
      return toRule(row);
    },
  };
}
