import pino from "pino";

// JSON logging thuần (không dùng pino-pretty) để tránh thêm dependency chưa cần thiết
// ở MVP (NFR-2 / nguyên tắc "không thêm dependency nếu không cần thiết", PHASE 05).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
