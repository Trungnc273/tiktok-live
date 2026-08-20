import { DEFAULT_TTS_LANGUAGE, isTTSLanguageCode, type AutomationRule, type ConditionNode, type RuleAction } from "@tiktok-live/shared-types";
import type { TriggerEventType } from "@tiktok-live/shared-types";
import type { CreateAutomationInput } from "./api-client.js";

export type BuilderActionDraft =
  | { type: "tts"; template: string; lang: string }
  | { type: "sound"; file: string };

export interface BuilderConditionDraft {
  field: string;
  op: ConditionNode extends { op: infer O } ? O : never;
  value: string;
}

export interface BuilderState {
  name: string;
  triggerEventType: TriggerEventType;
  /** Chỉ có ý nghĩa khi triggerEventType === "idle" — số giây im lặng trước khi tự đọc, lặp lại mỗi ngần ấy giây. */
  idleSeconds: number;
  condition: BuilderConditionDraft | null;
  actions: BuilderActionDraft[];
}

export const DEFAULT_IDLE_SECONDS = 20;
export const MIN_IDLE_SECONDS = 5;

const NUMERIC_OPS = new Set(["greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"]);

function toConditionNode(draft: BuilderConditionDraft): ConditionNode {
  const op = draft.op as Exclude<ConditionNode["op"], "and" | "or">;
  const value = NUMERIC_OPS.has(op) ? Number(draft.value) : draft.value;
  return { op, field: draft.field, value } as ConditionNode;
}

function toRuleAction(draft: BuilderActionDraft): RuleAction {
  if (draft.type === "tts") return { type: "tts", payload: { template: draft.template, lang: draft.lang } };
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
  if (state.triggerEventType === "idle" && (!Number.isFinite(state.idleSeconds) || state.idleSeconds < MIN_IDLE_SECONDS)) {
    errors.push(`Thời gian im lặng tối thiểu ${MIN_IDLE_SECONDS} giây`);
  }
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
    trigger:
      state.triggerEventType === "idle"
        ? { eventType: "idle", idleSeconds: state.idleSeconds }
        : { eventType: state.triggerEventType },
    conditions: state.condition ? toConditionNode(state.condition) : null,
    actions: state.actions.map(toRuleAction),
  };
}

export function emptyBuilderState(): BuilderState {
  return { name: "", triggerEventType: "gift", idleSeconds: DEFAULT_IDLE_SECONDS, condition: null, actions: [] };
}

/**
 * Chuyển 1 automation đã tồn tại (từ API) -> state cho form builder, để "Sửa" mở
 * lại đúng nội dung đã lưu thay vì phải gõ lại từ đầu. Builder chỉ hỗ trợ 1 so
 * sánh đơn (không có cây AND/OR — xem AutomationBuilder.tsx) và action type
 * tts/sound, đúng những gì chính builder này có thể tạo ra; action loại khác
 * (vd "obs.sceneChange", tạo qua API trực tiếp) bị bỏ qua khỏi form edit, không
 * bị xoá khỏi rule cho tới khi người dùng bấm lưu (BuildAutomationInput ghi đè
 * toàn bộ actions, xem cảnh báo ở AutomationBuilder.tsx khi phát hiện trường hợp này).
 */
export function ruleToBuilderState(rule: AutomationRule): BuilderState {
  const conditions = rule.conditions;
  const condition: BuilderConditionDraft | null =
    conditions && "field" in conditions
      ? { field: conditions.field, op: conditions.op as BuilderConditionDraft["op"], value: String(conditions.value) }
      : null;

  const actions: BuilderActionDraft[] = rule.actions
    .filter((a): a is RuleAction & { type: "tts" | "sound" } => a.type === "tts" || a.type === "sound")
    .map((a) => {
      if (a.type === "tts") {
        const payload = a.payload as { template: string; lang?: string };
        const lang = isTTSLanguageCode(payload.lang) ? payload.lang : DEFAULT_TTS_LANGUAGE;
        return { type: "tts" as const, template: payload.template, lang };
      }
      return { type: "sound" as const, file: (a.payload as { file: string }).file };
    });

  return {
    name: rule.name,
    triggerEventType: rule.trigger.eventType,
    idleSeconds: rule.trigger.eventType === "idle" ? (rule.trigger.idleSeconds ?? DEFAULT_IDLE_SECONDS) : DEFAULT_IDLE_SECONDS,
    condition,
    actions,
  };
}

/** true nếu rule có action loại builder này không sửa được (sẽ bị ghi đè nếu lưu). */
export function hasUnsupportedActions(rule: AutomationRule): boolean {
  return rule.actions.some((a) => a.type !== "tts" && a.type !== "sound");
}
