import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OBSService } from "../obs-service.js";
import { MockObsServer } from "./mock-obs-server.js";

let mockServer: MockObsServer;
let service: OBSService;
const port = 45455;

beforeEach(() => {
  mockServer = new MockObsServer(port);
  service = new OBSService();
});

afterEach(async () => {
  await service.disconnect();
  await mockServer.close();
});

describe("OBSService (mocked OBS WebSocket server)", () => {
  it("kết nối thành công tới mock OBS server", async () => {
    await service.connect({ url: mockServer.url });
    expect(service.isConnected()).toBe(true);
  });

  it("setCurrentScene gửi đúng request SetCurrentProgramScene", async () => {
    await service.connect({ url: mockServer.url });
    await service.setCurrentScene("Scene A");
    expect(mockServer.receivedSceneNames).toEqual(["Scene A"]);
  });

  it("throw lỗi rõ ràng khi gọi setCurrentScene trước khi connect", async () => {
    await expect(service.setCurrentScene("Scene A")).rejects.toThrow("chưa kết nối");
  });

  it("OBS trả lỗi request -> setCurrentScene reject", async () => {
    await service.connect({ url: mockServer.url });
    mockServer.failNextRequest = true;
    await expect(service.setCurrentScene("Scene A")).rejects.toThrow();
  });

  it("disconnect() rồi setCurrentScene() báo lỗi thay vì treo", async () => {
    await service.connect({ url: mockServer.url });
    await service.disconnect();
    expect(service.isConnected()).toBe(false);
    await expect(service.setCurrentScene("Scene A")).rejects.toThrow("chưa kết nối");
  });
});
