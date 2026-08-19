import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AutomationRule } from "@tiktok-live/shared-types";
import type { Database } from "./db.js";
import { automations } from "./schema.js";

export interface AutomationsRepository {
  list(): Promise<AutomationRule[]>;
  get(id: string): Promise<AutomationRule | null>;
  create(input: Omit<AutomationRule, "id" | "createdAt" | "updatedAt">): Promise<AutomationRule>;
  update(
    id: string,
    input: Partial<Omit<AutomationRule, "id" | "createdAt" | "updatedAt">>,
  ): Promise<AutomationRule | null>;
  delete(id: string): Promise<boolean>;
  duplicate(id: string): Promise<AutomationRule | null>;
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
    async list() {
      const rows = await db.select().from(automations);
      return rows.map(toRule);
    },

    async get(id) {
      const [row] = await db.select().from(automations).where(eq(automations.id, id));
      return row ? toRule(row) : null;
    },

    async create(input) {
      const [row] = await db
        .insert(automations)
        .values({
          id: randomUUID(),
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

    async update(id, input) {
      const patch: Partial<typeof automations.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.trigger !== undefined) patch.triggerEventType = input.trigger.eventType;
      if (input.conditions !== undefined) patch.conditions = input.conditions;
      if (input.actions !== undefined) patch.actions = input.actions;

      const [row] = await db.update(automations).set(patch).where(eq(automations.id, id)).returning();
      return row ? toRule(row) : null;
    },

    async delete(id) {
      const result = await db.delete(automations).where(eq(automations.id, id)).returning({ id: automations.id });
      return result.length > 0;
    },

    async duplicate(id) {
      const [original] = await db.select().from(automations).where(eq(automations.id, id));
      if (!original) return null;
      const [row] = await db
        .insert(automations)
        .values({
          id: randomUUID(),
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
