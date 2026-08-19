import type { ActionContext, ActionHandler } from "../action-engine/index.js";
import type { OBSService } from "./obs-service.js";

export interface OBSSceneChangeActionPayload {
  sceneName: string;
}

function isOBSSceneChangePayload(payload: unknown): payload is OBSSceneChangeActionPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "sceneName" in payload &&
    typeof (payload as { sceneName: unknown }).sceneName === "string"
  );
}

/**
 * Action handler cho `type: "obs.sceneChange"`. Action Engine chỉ biết interface
 * này — không biết chi tiết OBS WebSocket (docs/promp/PHASE_12.md).
 */
export function createOBSSceneChangeActionHandler(obsService: OBSService): ActionHandler {
  return {
    type: "obs.sceneChange",
    timeoutMs: 5000,
    async execute(action, _ctx: ActionContext): Promise<void> {
      if (!isOBSSceneChangePayload(action.payload)) {
        throw new Error('OBS scene change action payload không hợp lệ, thiếu field "sceneName" dạng string');
      }
      await obsService.setCurrentScene(action.payload.sceneName);
    },
  };
}
