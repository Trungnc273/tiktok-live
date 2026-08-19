/**
 * Giới hạn số job chạy đồng thời (docs/promp/PHASE_9-style test yêu cầu:
 * "phát nhiều sound đồng thời có giới hạn"). Khác TTSQueue (tuần tự nghiêm ngặt),
 * sound được phép chạy song song tới `maxConcurrent`, job vượt ngưỡng xếp hàng chờ.
 */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.waiting.shift();
      if (next) next();
    }
  }

  get activeCount(): number {
    return this.active;
  }
}
