import { randomUUID } from "node:crypto";
import type { LiveEvent } from "@tiktok-live/shared-types";
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

// Kiểm tra định kỳ mỗi bao lâu xem có rule "idle" nào cần bắn không — không cần
// chính xác tới mili-giây (chỉ là "nói khi im lặng quá lâu"), 2s là đủ mượt mà
// không tốn tài nguyên polling DB automations liên tục.
const IDLE_CHECK_INTERVAL_MS = 2000;
const DEFAULT_IDLE_SECONDS = 20;
const MIN_IDLE_SECONDS = 5;

interface Session {
  manager: ConnectionManager;
  mockInterval: ReturnType<typeof setInterval> | null;
  idleTimer: ReturnType<typeof setInterval>;
  tiktokUsername: string;
  /** Thời điểm (ms) của event thật gần nhất — mọi event thật (không tính idle tự sinh) reset mốc này. */
  lastActivityAt: number;
  /** Lần gần nhất mỗi rule "idle" đã bắn — để biết khi nào tới lượt lặp lại tiếp theo. */
  idleFiredAt: Map<string, number>;
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

  getActiveTikTokUsername(ownerId: string): string | null {
    return this.sessions.get(ownerId)?.tiktokUsername ?? null;
  }

  async start(ownerId: string, tiktokUsername: string): Promise<void> {
    const existing = this.sessions.get(ownerId);
    if (existing) {
      if (existing.tiktokUsername === tiktokUsername) {
        throw new Error("Đã đang theo dõi kênh này rồi");
      }
      // Người dùng đổi sang TikTok ID khác trong khi đang theo dõi -> tự động
      // dừng phiên cũ rồi mới bắt đầu phiên mới, KHÔNG bắt người dùng phải tự
      // bấm "Dừng theo dõi" trước (trước đây start() chặn cứng bằng lỗi 409,
      // khiến người dùng tưởng đã chuyển kênh nhưng thực ra vẫn đang xem kênh cũ).
      logger.info(
        { ownerId, from: existing.tiktokUsername, to: tiktokUsername },
        "Đổi kênh TikTok đang theo dõi — tự dừng phiên cũ trước khi bắt đầu phiên mới",
      );
      await this.stop(ownerId);
    }

    const provider = this.deps.useMockProvider
      ? new MockProvider()
      : new TikTokLiveConnectorProvider({ signApiKey: this.deps.eulerStreamApiKey });
    const manager = new ConnectionManager(provider);

    let statusTracker = this.deps.statusTrackers.get(ownerId);
    if (!statusTracker) {
      statusTracker = new StatusTracker();
      this.deps.statusTrackers.set(ownerId, statusTracker);
    } else {
      // Tracker cũ (nếu có, từ phiên trước) bị tái sử dụng theo ownerId -> phải
      // reset số liệu, không thì follow/like/comment/gift của kênh cũ sẽ cộng
      // dồn sang kênh mới.
      statusTracker.reset();
    }
    const tracker = statusTracker;

    let streamId = "unlinked";
    const idleFiredAt = new Map<string, number>();
    // Bắt đầu phiên = coi như vừa có hoạt động, tránh rule idle bắn ngay lập tức
    // trước khi live thật sự bắt đầu có tương tác.
    let lastActivityAt = Date.now();

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
      lastActivityAt = Date.now(); // có hoạt động thật -> reset mốc đếm im lặng
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

    const idleTimer = setInterval(() => {
      void this.runIdleCheck(ownerId, () => streamId, () => lastActivityAt, idleFiredAt);
    }, IDLE_CHECK_INTERVAL_MS);

    this.sessions.set(ownerId, { manager, mockInterval, idleTimer, tiktokUsername, lastActivityAt, idleFiredAt });
  }

  /**
   * Tự nhắc khi live im lặng quá lâu (yêu cầu người dùng: "cứ 20s nói 1 lần nếu
   * không có gì"). Chạy độc lập với luồng event thật — synthesize 1 `IdleEvent`
   * và đi qua ĐÚNG evaluateRules()/actionDispatcher như event thật, nên tái dùng
   * toàn bộ hạ tầng match rule + chạy action (TTS/sound) sẵn có, không cần viết
   * đường riêng cho TTS.
   */
  private async runIdleCheck(
    ownerId: string,
    getStreamId: () => string,
    getLastActivityAt: () => number,
    idleFiredAt: Map<string, number>,
  ): Promise<void> {
    let rules;
    try {
      rules = await this.deps.automationsRepository.list(ownerId);
    } catch (err) {
      logger.error({ err, ownerId }, "idle-check: không đọc được automations từ DB");
      return;
    }

    const idleRules = rules.filter((r) => r.enabled && r.trigger.eventType === "idle");
    if (idleRules.length === 0) return;

    const now = Date.now();
    const silentForMs = now - getLastActivityAt();

    for (const rule of idleRules) {
      const idleMs = Math.max(MIN_IDLE_SECONDS, rule.trigger.idleSeconds ?? DEFAULT_IDLE_SECONDS) * 1000;
      if (silentForMs < idleMs) continue; // chưa im lặng đủ lâu cho rule này
      const lastFired = idleFiredAt.get(rule.id) ?? 0;
      if (now - lastFired < idleMs) continue; // chưa tới lượt lặp lại tiếp theo
      idleFiredAt.set(rule.id, now);

      const idleEvent: LiveEvent = {
        schemaVersion: 1,
        id: randomUUID(),
        timestamp: new Date(now).toISOString(),
        streamId: getStreamId(),
        user: { id: "system", username: "system" },
        type: "idle",
        payload: {},
      };

      const matches = evaluateRules([rule], idleEvent);
      for (const match of matches) {
        void this.deps.actionDispatcher
          .dispatch(match, { ruleId: match.ruleId, ruleName: match.ruleName, ownerId, event: idleEvent })
          .catch((err: unknown) => {
            logger.error({ err, ownerId, ruleId: match.ruleId }, "action-dispatcher: lỗi không mong đợi (idle)");
          });
      }
    }
  }

  async stop(ownerId: string): Promise<void> {
    const session = this.sessions.get(ownerId);
    if (!session) return;
    if (session.mockInterval) clearInterval(session.mockInterval);
    clearInterval(session.idleTimer);
    await session.manager.stop();
    this.sessions.delete(ownerId);
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.stop(id)));
  }
}
