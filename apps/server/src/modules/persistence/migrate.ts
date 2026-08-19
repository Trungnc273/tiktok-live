import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { logger } from "../../config/logger.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://tiktok_live:tiktok_live_dev_only@127.0.0.1:5544/tiktok_live";

async function main(): Promise<void> {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  logger.info({ connectionString }, "Chạy migration...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Migration hoàn tất.");
  await client.end();
}

main().catch((err) => {
  logger.error({ err }, "Migration thất bại");
  process.exitCode = 1;
});
