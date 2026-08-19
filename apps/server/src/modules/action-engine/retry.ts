/**
 * Chạy lại `fn` tối đa `maxRetries` lần khi thất bại. Không delay giữa các lần
 * retry ở MVP (action timeout đã đủ ngắn — xem docs/architecture/SYSTEM-ARCHITECTURE.md,
 * TTS/Sound retry tối đa 2 lần với timeout ngắn); thêm backoff sau nếu cần ở Phase 2.
 */
export async function runWithRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
