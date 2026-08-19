import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/modules/persistence/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live",
  },
});
