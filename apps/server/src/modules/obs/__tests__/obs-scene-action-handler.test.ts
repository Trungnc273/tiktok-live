import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LiveEvent } from "@tiktok-live/shared-types";
import { ActionDispatcher, HandlerRegistry, MemoryExecutionLogPort } from "../../action-engine/index.js";
import { OBSService } from "../obs-service.js";
import { createOBSSceneChangeActionHandler } from "../obs-scene-action-handler.js";
import { MockObsServer } from "./mock-obs-server.js";

let mockServer: MockObsServer;
let obsService: OBSService;
const port = 45456;

beforeEach(() => {
  mockServer = new MockObsServer(port);
  obsService = new OBSService();
});

afterEach(async () => {
  await obsService.disconnect();
  await mockServer.close();
});

function giftEvent(): LiveEvent {
  return {
    schemaVersion: 1,
    id: "event-1",
    timestamp: new Date().toISOString(),
    streamId: "stream-1",
    type: "gift",
    user: { id: "u1", username: "gifter" },
    payload: { giftId: "1", giftName: "Rose", count: 1, isStreakEnd: true },
  } as LiveEvent;
}

describe("OBS scene change action handler (qua ActionDispatcher)", () => {
  it("đổi scene thành công qua mocked OBS server", async () => {
    await obsService.connect({ url: mockServer.url });
    const registry = new HandlerRegistry();
    registry.register(createOBSSceneChangeActionHandler(obsService));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "t", eventId: "e1", actions: [{ type: "obs.sceneChange", payload: { sceneName: "Gift Scene" } }] },
      { ruleId: "r1", ruleName: "t", ownerId: "owner-1", event: giftEvent() },
    );

    expect(outcomes[0].status).toBe("success");
    expect(mockServer.receivedSceneNames).toEqual(["Gift Scene"]);
  });

  it("payload thiếu sceneName -> action failed, không throw ra ngoài", async () => {
    await obsService.connect({ url: mockServer.url });
    const registry = new HandlerRegistry();
    registry.register(createOBSSceneChangeActionHandler(obsService));
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "t", eventId: "e1", actions: [{ type: "obs.sceneChange", payload: {} }] },
      { ruleId: "r1", ruleName: "t", ownerId: "owner-1", event: giftEvent() },
    );

    expect(outcomes[0].status).toBe("failed");
  });

  it("OBS chưa kết nối -> action failed rõ ràng, không làm crash dispatcher", async () => {
    const registry = new HandlerRegistry();
    registry.register(createOBSSceneChangeActionHandler(obsService)); // chưa connect()
    const dispatcher = new ActionDispatcher(registry, new MemoryExecutionLogPort());

    const outcomes = await dispatcher.dispatch(
      { ruleId: "r1", ruleName: "t", eventId: "e1", actions: [{ type: "obs.sceneChange", payload: { sceneName: "X" } }] },
      { ruleId: "r1", ruleName: "t", ownerId: "owner-1", event: giftEvent() },
    );

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].error).toContain("chưa kết nối");
  });
});
