import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionContext, ActionHandler } from "../action-engine/index.js";
import { buildTemplateVariables } from "./template-variables.js";
import { renderTemplate } from "./template.js";
import type { TTSProvider } from "./provider.js";
import type { TTSQueue } from "./tts-queue.js";
import { logger } from "../../config/logger.js";

export interface TTSActionPayload {
  template: string;
  /** Mã ngôn ngữ đọc (xem TTS_LANGUAGES ở @tiktok-live/shared-types) — không có = provider tự chọn mặc định. */
  lang?: string;
}

function isTTSActionPayload(payload: unknown): payload is TTSActionPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "template" in payload &&
    typeof (payload as { template: unknown }).template === "string"
  );
}

/**
 * Action handler cho `type: "tts"`. Render template -> enqueue vào TTSQueue (tuần
 * tự, chống chồng tiếng) -> gọi TTSProvider để tổng hợp ra file WAV.
 *
 * `onAudioReady` là điểm nối ra ngoài (overlay-gateway sẽ dùng ở M08/M09 để phát
 * tại trình duyệt overlay thay vì loa server — quyết định đã ghi ở MILESTONES.md M07).
 * Ở M06, mặc định chỉ log đường dẫn file, CHƯA phát ra đâu cả.
 */
export function createTTSActionHandler(
  provider: TTSProvider,
  queue: TTSQueue,
  options: {
    timeoutMs?: number;
    /** Thư mục ghi file audio ra — mặc định OS tmpdir. Ở M09, main.ts truyền vào 1 thư mục được Fastify phục vụ tĩnh (/media) để overlay tải về phát được. */
    outputDir?: string;
    onAudioReady?: (filePath: string, ctx: ActionContext) => void;
  } = {},
): ActionHandler {
  const outputDir = options.outputDir ?? tmpdir();
  const onAudioReady = options.onAudioReady ?? ((filePath) => logger.info({ filePath }, "TTS audio sẵn sàng"));

  return {
    type: "tts",
    timeoutMs: options.timeoutMs ?? 10_000,
    maxRetries: 1, // synthesize là idempotent (không có side-effect bên ngoài) -> an toàn để retry 1 lần
    async execute(action, ctx: ActionContext): Promise<void> {
      if (!isTTSActionPayload(action.payload)) {
        throw new Error('TTS action payload không hợp lệ, thiếu field "template" dạng string');
      }

      const variables = buildTemplateVariables(ctx.event);
      const { text, missingVariables } = renderTemplate(action.payload.template, variables);

      if (missingVariables.length > 0) {
        logger.warn(
          { missingVariables, template: action.payload.template },
          "TTS template tham chiếu biến không tồn tại cho event type này",
        );
      }

      if (text.trim().length === 0) {
        throw new Error("TTS: text rỗng sau khi render template, không có gì để đọc");
      }

      const outFilePath = join(outputDir, `tiktok-live-tts-${randomUUID()}.wav`);
      const lang = action.payload.lang; // đọc ra biến local — TS không giữ narrowing qua closure bên dưới
      try {
        await queue.enqueue(() => provider.synthesizeToFile(text, outFilePath, { lang }));
      } catch (err) {
        // PHASE 14 audit M4: hàng đợi đầy (gift bão) trước đây chỉ tăng
        // queue.droppedCount âm thầm, không nơi nào log lại — streamer không biết
        // có lời cảm ơn đã bị bỏ qua. Action vẫn "failed" như cũ (rethrow), nhưng
        // giờ có 1 dòng log rõ ràng kèm droppedCount tích luỹ để dễ phát hiện qua log.
        if (err instanceof Error && err.message.includes("hàng đợi đầy")) {
          logger.warn({ droppedCount: queue.droppedCount, ruleId: ctx.ruleId }, "TTSQueue: job bị drop do quá tải");
        }
        throw err;
      }
      onAudioReady(outFilePath, ctx);
    },
  };
}
