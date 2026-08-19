import { ControlEvent, TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import type { AdapterEvent, LiveProvider } from "../types.js";

/**
 * Provider thật — cô lập toàn bộ chi tiết của thư viện unofficial
 * "tiktok-live-connector" ở đây. Không module nào khác trong hệ thống được
 * import trực tiếp "tiktok-live-connector" (docs/architecture/SYSTEM-ARCHITECTURE.md).
 *
 * Chỉ các event đã được docs/research/TIKTOK-LIVE-CAPABILITY.md xác nhận cần dùng
 * cho MVP mới được forward: CHAT, GIFT, LIKE, FOLLOW, SHARE, MEMBER, ROOM_USER.
 * Mọi event khác của thư viện KHÔNG được forward ở M01 (event-normalizer ở M02 sẽ
 * quyết định event nào map được, event chưa map trở thành UnknownEvent).
 *
 * GHI CHÚ VỀ TYPE: bản .d.ts được publish trong tiktok-live-connector@2.4.4 không
 * expose đúng các phương thức kế thừa từ TypedEventEmitter (`on`) trên type
 * `TikTokLiveConnection` — xác nhận bằng repro tối giản, không phải lỗi ở code này.
 * Runtime JS hoạt động bình thường (đã kiểm chứng qua README + cấu trúc export).
 * Dùng interface hẹp `EventEmittingConnection` bên dưới để giữ type-safety cho
 * phần code của chính chúng ta, thay vì cast toàn bộ object sang `any`.
 */

interface EventEmittingConnection {
  on(event: string, handler: (data: unknown) => void): unknown;
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown>;
}

const FORWARDED_EVENTS: string[] = [
  WebcastEvent.CHAT,
  WebcastEvent.GIFT,
  WebcastEvent.LIKE,
  WebcastEvent.FOLLOW,
  WebcastEvent.SHARE,
  WebcastEvent.MEMBER,
  WebcastEvent.ROOM_USER,
];

export interface TikTokLiveConnectorProviderOptions {
  signApiKey?: string;
}

export class TikTokLiveConnectorProvider implements LiveProvider {
  private connection: EventEmittingConnection | null = null;
  private eventHandler: ((event: AdapterEvent) => void) | null = null;
  private disconnectHandler: ((reason: unknown) => void) | null = null;
  private readonly options: TikTokLiveConnectorProviderOptions;

  constructor(options: TikTokLiveConnectorProviderOptions = {}) {
    this.options = options;
  }

  async connect(username: string): Promise<void> {
    const connection = new TikTokLiveConnection(username, {
      signApiKey: this.options.signApiKey,
    }) as unknown as EventEmittingConnection;

    for (const eventName of FORWARDED_EVENTS) {
      connection.on(eventName, (data: unknown) => {
        this.eventHandler?.({
          name: eventName,
          data,
          receivedAt: new Date().toISOString(),
        });
      });
    }

    connection.on(ControlEvent.DISCONNECTED, (info: unknown) => {
      this.disconnectHandler?.(info);
    });

    this.connection = connection;
    await connection.connect();
  }

  async disconnect(): Promise<void> {
    await this.connection?.disconnect();
    this.connection = null;
  }

  onEvent(handler: (event: AdapterEvent) => void): void {
    this.eventHandler = handler;
  }

  onDisconnect(handler: (reason: unknown) => void): void {
    this.disconnectHandler = handler;
  }
}
