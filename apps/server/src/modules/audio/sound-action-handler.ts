import type { ActionContext, ActionHandler } from "../action-engine/index.js";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";
import { validateSoundFile } from "./validate-sound-file.js";

export interface SoundActionPayload {
  file: string;
}

function isSoundActionPayload(payload: unknown): payload is SoundActionPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "file" in payload &&
    typeof (payload as { file: unknown }).file === "string"
  );
}

export interface CreateSoundActionHandlerOptions {
  soundsDir: string;
  /** Số sound tối đa phát đồng thời — MILESTONES.md M07: "phát nhiều sound đồng thời có giới hạn". */
  maxConcurrent?: number;
  /**
   * Điểm nối ra ngoài (overlay-gateway sẽ dùng ở M08/M09 để phát tại trình duyệt
   * overlay — quyết định đã ghi ở MILESTONES.md M07: ưu tiên phát ở overlay browser
   * thay vì loa server, né rủi ro thư viện audio native cross-platform).
   */
  onSoundReady?: (absolutePath: string, ctx: ActionContext) => void | Promise<void>;
}

export function createSoundActionHandler(options: CreateSoundActionHandlerOptions): ActionHandler {
  const limiter = new ConcurrencyLimiter(options.maxConcurrent ?? 5);

  return {
    type: "sound",
    timeoutMs: 5000,
    async execute(action, ctx: ActionContext): Promise<void> {
      if (!isSoundActionPayload(action.payload)) {
        throw new Error('Sound action payload không hợp lệ, thiếu field "file" dạng string');
      }

      const result = await validateSoundFile(action.payload.file, options.soundsDir);
      if (!result.valid) {
        throw new Error(`Sound action: ${result.error}`);
      }

      await limiter.run(async () => {
        await options.onSoundReady?.(result.absolutePath!, ctx);
      });
    },
  };
}
