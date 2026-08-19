// Dùng bản mã hoá JSON tường minh (không phải msgpack mặc định của Node build) —
// dễ debug hơn, và khớp với mock server dùng trong test (mock-obs-server.ts).
import OBSWebSocket from "obs-websocket-js/json";
import { logger } from "../../config/logger.js";

export interface OBSConnectOptions {
  url: string;
  password?: string;
}

/**
 * OBSService — abstraction duy nhất che thư viện obs-websocket-js
 * (docs/promp/PHASE_12.md: "Do not couple Rule Engine directly to OBS" — Rule
 * Engine/Action Engine chỉ biết action `type: "obs.sceneChange"`, không import
 * obs-websocket-js trực tiếp).
 *
 * BẢO MẬT: `password` chỉ dùng TỨC THỜI trong lời gọi `connect()`, KHÔNG BAO GIỜ
 * gán vào field của instance hay đưa vào bất kỳ câu log nào — loại bỏ khả năng lộ
 * password qua log hay qua việc serialize object này (SYSTEM-ARCHITECTURE.md Security).
 */
export class OBSService {
  private readonly obs = new OBSWebSocket();
  private connected = false;

  async connect(options: OBSConnectOptions): Promise<void> {
    logger.info({ url: options.url }, "Đang kết nối OBS WebSocket"); // KHÔNG log password
    await this.obs.connect(options.url, options.password);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.obs.disconnect();
    this.connected = false;
  }

  async setCurrentScene(sceneName: string): Promise<void> {
    if (!this.connected) {
      throw new Error("OBSService: chưa kết nối tới OBS");
    }
    await this.obs.call("SetCurrentProgramScene", { sceneName });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
