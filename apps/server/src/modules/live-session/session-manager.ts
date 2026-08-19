import {
  ConnectionManager,
  MockProvider,
  TikTokLiveConnectorProvider,
  type ConnectionState,
} from "../tiktok-adapter/index.js";
import { normalizeAndValidate } from "../event-normalizer/index.js";
import { evaluateRules } from "../rule-engine/index.js";
import type { ActionDispatcher } from "../action-engine/index.js";
import type { AutomationsRepository, EventsRepository } from "../persistence/index.js";
import type { OverlayGateway } from "../overlay-gateway/index.js";
import { StatusTracker } from "../api/status-tracker.js";
import { logger } from "../../config/logger.js";

interface Session {
  manager: ConnectionManager;
  mockInterval: ReturnType<typeof setInterval> | null;
}

export interface LiveSessionManagerDeps {
  eulerStreamApiKey?: string;
  eventsRepository: EventsRepository;
  automationsRepository: AutomationsRepository;
  actionDispatcher: ActionDispatcher;
  overlayGateway: OverlayGateway;
  statusTrackers: Map<string, StatusTracker>;
  /** true khi không có TikTok username thật để test (dev) — dùng MockProvider bơm event giả lập. */
  useMockProvider: boolean;
}

/**
 * LiveSessionManager (multi-tenant, bổ sung sau MVP) — thay thế mô hình "1 kết nối
 * TikTok toàn cục" của MVP gốc bằng "1 kết nối riêng cho từng tài khoản nền tảng
 * (`ownerId`) đang bật theo dõi live". Mỗi session độc lập hoàn toàn: kết nối TikTok
 * riêng, StatusTracker riêng, broadcast overlay riêng theo room của owner đó.
 */
export class LiveSessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly deps: LiveSessionManagerDeps) {}

  isActive(ownerId: string): boolean {
    return this.sessions.has(ownerId);
  }

  getState(ownerId: string): ConnectionState | "idle" {
    return this.sessions.get(ownerId)?.manager.getState() ?? "idle";
  }

  async start(ownerId: string, tiktokUsername: string): Promise<void> {
    if (this.sessions.has(ownerId)) {
      throw new Error("Đã có phiên theo dõi TikTok đang chạy cho tài khoản này");
    }

    const provider = this.deps.useMockProvider
      ? new MockProvider()
      : new TikTokLiveConnectorProvider({ signApiKey: this.deps.eulerStreamApiKey });
    const manager = new ConnectionManager(provider);

    let statusTracker = this.deps.statusTrackers.get(ownerId);
    if (!statusTracker) {
      statusTracker = new StatusTracker();
      this.deps.statusTrackers.set(ownerId, statusTracker);
    }
    const tracker = statusTracker;

    let streamId = "unlinked";

    manager.on("stateChange", (state: ConnectionState) => {
      tracker.setConnectionState(state);
    });

    manager.on("event", (rawEvent) => {
      const result = normalizeAndValidate(rawEvent, streamId);
      if (!result.ok) {
        logger.warn({ ownerId, error: result.error }, "event-normalizer: bỏ qua event không hợp lệ");
        return;
      }
      const liveEvent = result.event;
      tracker.recordEvent(liveEvent);

      const sessionId = streamId === "unlinked" ? null : streamId;
      this.deps.eventsRepository.recordEvent(liveEvent, sessionId).catch((err: unknown) => {
        logger.error({ err, ownerId, eventId: liveEvent.id }, "persistence: ghi events_log thất bại");
      });

      this.deps.overlayGateway.broadcast(ownerId, "liveEvent", liveEvent);

      this.deps.automationsRepository
        .list(ownerId)
        .then((rules) => {
          const matches = evaluateRules(rules, liveEvent);
          for (const match of matches) {
            void this.deps.actionDispatcher
              .dispatch(match, { ruleId: match.ruleId, ruleName: match.ruleName, ownerId, event: liveEvent })
              .catch((err: unknown) => {
                logger.error({ err, ownerId, ruleId: match.ruleId }, "action-dispatcher: lỗi không mong đợi");
              });
          }
        })
        .catch((err: unknown) => {
          logger.error({ err, ownerId }, "rule-engine: không đọc được automations từ DB");
        });
    });

    manager.on("connectionError", (err: Error) => {
      logger.error({ err, ownerId }, "tiktok-adapter error");
    });

    try {
      streamId = await this.deps.eventsRepository.createStreamSession(ownerId, tiktokUsername);
    } catch (err) {
      logger.error({ err, ownerId }, "Không tạo được stream session — tiếp tục chạy không gắn session");
    }

    await manager.connect(tiktokUsername);

    let mockInterval: ReturnType<typeof setInterval> | null = null;
    if (this.deps.useMockProvider) {
      const mockProvider = provider as MockProvider;
      mockInterval = setInterval(() => {
        mockProvider.emitFakeEvent("chat", { content: "hello", user: { id: "1", uniqueId: "test_user" } });
      }, 5000);
    }

    this.sessions.set(ownerId, { manager, mockInterval });
  }

  async stop(ownerId: string): Promise<void> {
    const session = this.sessions.get(ownerId);
    if (!session) return;
    if (session.mockInterval) clearInterval(session.mockInterval);
    await session.manager.stop();
    this.sessions.delete(ownerId);
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}
