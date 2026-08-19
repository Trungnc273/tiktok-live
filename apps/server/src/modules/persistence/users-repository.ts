import { asc, eq } from "drizzle-orm";
import type { Database } from "./db.js";
import { users } from "./schema.js";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  tiktokUsername: string | null;
  disabledAt: string | null;
  createdAt: string;
}

export interface UsersRepository {
  create(input: { email: string; passwordHash: string; role: "admin" | "user" }): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  list(): Promise<User[]>;
  countAll(): Promise<number>;
  setDisabled(id: string, disabled: boolean): Promise<void>;
  setTiktokUsername(id: string, tiktokUsername: string | null): Promise<void>;
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role as "admin" | "user",
    tiktokUsername: row.tiktokUsername,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createUsersRepository(db: Database): UsersRepository {
  return {
    async create(input) {
      const [row] = await db
        .insert(users)
        .values({ email: input.email.toLowerCase().trim(), passwordHash: input.passwordHash, role: input.role })
        .returning();
      return toUser(row);
    },

    async findByEmail(email) {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()));
      return row ? toUser(row) : null;
    },

    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row ? toUser(row) : null;
    },

    async list() {
      const rows = await db.select().from(users).orderBy(asc(users.createdAt));
      return rows.map(toUser);
    },

    async countAll() {
      const rows = await db.select({ id: users.id }).from(users);
      return rows.length;
    },

    async setDisabled(id, disabled) {
      await db
        .update(users)
        .set({ disabledAt: disabled ? new Date() : null })
        .where(eq(users.id, id));
    },

    async setTiktokUsername(id, tiktokUsername) {
      await db.update(users).set({ tiktokUsername }).where(eq(users.id, id));
    },
  };
}
