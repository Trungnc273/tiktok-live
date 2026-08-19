import { describe, expect, it } from "vitest";
import { TTSQueue } from "../tts-queue.js";

describe("TTSQueue", () => {
  it("xử lý job tuần tự, không chồng nhau (mặc định allowOverlap=false)", async () => {
    const queue = new TTSQueue();
    const order: number[] = [];
    let running = 0;
    let maxConcurrent = 0;

    const makeJob = (id: number) => async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(id);
      running -= 1;
    };

    await Promise.all([queue.enqueue(makeJob(1)), queue.enqueue(makeJob(2)), queue.enqueue(makeJob(3))]);

    expect(order).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1); // không bao giờ chạy chồng
  });

  it("concurrent events: nhiều job cùng lúc vẫn xử lý đúng, không mất job", async () => {
    const queue = new TTSQueue();
    const results: number[] = [];
    const jobs = Array.from({ length: 10 }, (_, i) => queue.enqueue(async () => void results.push(i)));
    await Promise.all(jobs);
    expect(results).toHaveLength(10);
  });

  it("rate limiting: tôn trọng minIntervalMs giữa 2 job liên tiếp", async () => {
    const queue = new TTSQueue({ minIntervalMs: 30 });
    const timestamps: number[] = [];
    const job = async () => void timestamps.push(Date.now());

    await Promise.all([queue.enqueue(job), queue.enqueue(job), queue.enqueue(job)]);

    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(25); // cho phép sai số nhỏ
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(25);
  });

  it("hàng đợi đầy -> job mới bị drop (reject), job đang chờ không bị ảnh hưởng", async () => {
    const queue = new TTSQueue({ maxQueueSize: 1, minIntervalMs: 50 });
    const p1 = queue.enqueue(async () => new Promise((r) => setTimeout(r, 100)));
    const p2 = queue.enqueue(async () => void "ok"); // vào hàng đợi (size 1, đang chờ job1 xử lý xong)
    const p3 = queue.enqueue(async () => void "dropped"); // hàng đợi đầy -> reject ngay

    await expect(p3).rejects.toThrow(/hàng đợi đầy/);
    await expect(p1).resolves.toBeUndefined();
    await expect(p2).resolves.toBeUndefined();
    expect(queue.droppedCount).toBe(1);
  });

  it("job lỗi -> Promise trả về từ enqueue() reject đúng lỗi đó", async () => {
    const queue = new TTSQueue();
    const failing = queue.enqueue(async () => {
      throw new Error("job thất bại");
    });
    await expect(failing).rejects.toThrow("job thất bại");
  });

  it("allowOverlap=true: job chạy song song, không qua hàng đợi tuần tự", async () => {
    const queue = new TTSQueue({ allowOverlap: true });
    let concurrentCount = 0;
    let maxConcurrent = 0;
    const job = async () => {
      concurrentCount += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 20));
      concurrentCount -= 1;
    };
    await Promise.all([queue.enqueue(job), queue.enqueue(job), queue.enqueue(job)]);
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
