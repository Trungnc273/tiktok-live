/**
 * Hàng đợi TTS tuần tự (docs/promp/PHASE_9.md):
 *
 *   Event -> TTS request -> Queue -> Worker -> Audio
 *
 * Mặc định xử lý TUẦN TỰ (concurrency=1) để không chồng tiếng nói, trừ khi
 * `allowOverlap: true` được cấu hình tường minh. Có rate limit tối thiểu giữa 2
 * job liên tiếp (`minIntervalMs`) để tránh gift bão dồn hàng chục câu TTS liên tục.
 *
 * `enqueue()` trả về Promise resolve/reject theo đúng kết quả job — để caller
 * (TTSActionHandler) await được và báo status success/failed đúng cho Action Engine.
 */
export interface TTSQueueOptions {
  allowOverlap?: boolean;
  minIntervalMs?: number;
  /** Số job tối đa chờ trong hàng đợi — vượt ngưỡng, job MỚI bị reject ngay (drop), job đang chờ trước đó không bị ảnh hưởng. */
  maxQueueSize?: number;
}

type Job = () => Promise<void>;
interface QueueItem {
  job: Job;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export class TTSQueue {
  private readonly queue: QueueItem[] = [];
  private processing = false;
  private lastRunAt = 0;
  private readonly options: Required<TTSQueueOptions>;
  public droppedCount = 0;

  constructor(options: TTSQueueOptions = {}) {
    this.options = {
      allowOverlap: options.allowOverlap ?? false,
      minIntervalMs: options.minIntervalMs ?? 0,
      maxQueueSize: options.maxQueueSize ?? 50,
    };
  }

  enqueue(job: Job): Promise<void> {
    if (this.options.allowOverlap) {
      return job();
    }

    if (this.queue.length >= this.options.maxQueueSize) {
      this.droppedCount += 1;
      return Promise.reject(new Error("TTSQueue: hàng đợi đầy, job bị drop"));
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      void this.process();
    });
  }

  get size(): number {
    return this.queue.length;
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const wait = this.options.minIntervalMs - (Date.now() - this.lastRunAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

      const item = this.queue.shift();
      if (!item) break;
      this.lastRunAt = Date.now();
      try {
        await item.job();
        item.resolve();
      } catch (err) {
        item.reject(err);
      }
    }

    this.processing = false;
  }
}
