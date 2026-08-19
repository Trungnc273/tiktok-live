import type { ConditionNode, RuleAction } from "@tiktok-live/shared-types";
import type { TriggerEventType } from "@tiktok-live/shared-types";
import type { CreateAutomationInput } from "./api-client.js";

export type BuilderActionDraft =
  | { type: "tts"; template: string }
  | { type: "sound"; file: string };

export interface BuilderConditionDraft {
  field: string;
  op: ConditionNode extends { op: infer O } ? O : never;
  value: string;
}

export interface BuilderState {
  name: string;
  triggerEventType: TriggerEventType;
  condition: BuilderConditionDraft | null;
  actions: BuilderActionDraft[];
}

const NUMERIC_OPS = new Set(["greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"]);

function toConditionNode(draft: BuilderConditionDraft): ConditionNode {
  const op = draft.op as Exclude<ConditionNode["op"], "and" | "or">;
  const value = NUMERIC_OPS.has(op) ? Number(draft.value) : draft.value;
  return { op, field: draft.field, value } as ConditionNode;
}

function toRuleAction(draft: BuilderActionDraft): RuleAction {
  if (draft.type === "tts") return { type: "tts", payload: { template: draft.template } };
  return { type: "sound", payload: { file: draft.file } };
}

export interface BuilderValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate tối thiểu ở client trước khi gọi API (server vẫn validate lại — đây chỉ để UX nhanh). */
export function validateBuilderState(state: BuilderState): BuilderValidationResult {
  const errors: string[] = [];
  if (state.name.trim().length === 0) errors.push("Tên automation không được để trống");
  if (state.actions.length === 0) errors.push("Cần ít nhất 1 action");
  for (const action of state.actions) {
    if (action.type === "tts" && action.template.trim().length === 0) {
      errors.push("Nội dung TTS không được để trống");
    }
    if (action.type === "sound" && action.file.trim().length === 0) {
      errors.push("Tên file sound không được để trống");
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Chuyển state form (UI) -> payload gửi API — hàm thuần, dễ test độc lập với DOM. */
export function buildAutomationInput(state: BuilderState): CreateAutomationInput {
  return {
    name: state.name.trim(),
    enabled: true,
    priority: 100,
    trigger: { eventType: state.triggerEventType },
    conditions: state.condition ? toConditionNode(state.condition) : null,
    actions: state.actions.map(toRuleAction),
  };
}

export function emptyBuilderState(): BuilderState {
  return { name: "", triggerEventType: "gift", condition: null, actions: [] };
}
