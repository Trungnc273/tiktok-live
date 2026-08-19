import { useState } from "react";
import { FIELD_WHITELIST, type TriggerEventType } from "@tiktok-live/shared-types";
import {
  buildAutomationInput,
  emptyBuilderState,
  validateBuilderState,
  type BuilderActionDraft,
  type BuilderState,
} from "./automation-builder-logic.js";
import type { CreateAutomationInput } from "./api-client.js";

const EVENT_TYPES: TriggerEventType[] = ["follow", "like", "comment", "share", "gift", "join"];
const CONDITION_OPS = [
  "equals",
  "notEquals",
  "contains",
  "greaterThan",
  "lessThan",
  "greaterOrEqual",
  "lessOrEqual",
] as const;

interface Props {
  onCreate: (input: CreateAutomationInput) => Promise<void>;
}

/**
 * Automation Builder (docs/promp/PHASE_11.md): người không biết code tạo được
 * "Gift Rose -> TTS + Sound" chỉ qua form WHEN/IF/THEN, không viết JSON tay.
 * MVP: điều kiện chỉ hỗ trợ 1 so sánh đơn (không có UI cây AND/OR lồng nhau) —
 * ưu tiên đơn giản theo đúng PHASE 11 ("Simplicity > đầy đủ tính năng"); engine
 * (RULE-ENGINE.md) vẫn hỗ trợ đầy đủ AND/OR, UI phức tạp hơn để dành cho Phase 2.
 */
export function AutomationBuilder({ onCreate }: Props) {
  const [state, setState] = useState<BuilderState>(emptyBuilderState());
  const [conditionEnabled, setConditionEnabled] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const availableFields = FIELD_WHITELIST[state.triggerEventType];

  function updateAction(index: number, patch: Partial<BuilderActionDraft>) {
    setState((s) => ({
      ...s,
      actions: s.actions.map((a, i) => (i === index ? ({ ...a, ...patch } as BuilderActionDraft) : a)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateBuilderState(state);
    setErrors(validation.errors);
    if (!validation.valid) return;

    setSubmitting(true);
    try {
      await onCreate(buildAutomationInput(state));
      setState(emptyBuilderState());
      setConditionEnabled(false);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Tạo automation thất bại"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="automation-builder" style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <label>
        Tên automation
        <input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Ví dụ: Gift Rose -> Cảm ơn"
        />
      </label>

      <label>
        WHEN (trigger)
        <select
          value={state.triggerEventType}
          onChange={(e) =>
            setState((s) => ({ ...s, triggerEventType: e.target.value as TriggerEventType, condition: null }))
          }
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label>
        <input type="checkbox" checked={conditionEnabled} onChange={(e) => setConditionEnabled(e.target.checked)} />
        IF (điều kiện, tuỳ chọn)
      </label>
      {conditionEnabled && (
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={state.condition?.field ?? availableFields[0]}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                condition: { field: e.target.value, op: s.condition?.op ?? "equals", value: s.condition?.value ?? "" },
              }))
            }
          >
            {availableFields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={state.condition?.op ?? "equals"}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                condition: { field: s.condition?.field ?? availableFields[0], op: e.target.value as never, value: s.condition?.value ?? "" },
              }))
            }
          >
            {CONDITION_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            placeholder="giá trị"
            value={state.condition?.value ?? ""}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                condition: { field: s.condition?.field ?? availableFields[0], op: s.condition?.op ?? "equals", value: e.target.value },
              }))
            }
          />
        </div>
      )}

      <div>
        THEN (actions)
        {state.actions.map((action, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {action.type === "tts" ? (
              <input
                placeholder="Cảm ơn {username}!"
                value={action.template}
                onChange={(e) => updateAction(i, { template: e.target.value })}
              />
            ) : (
              <input
                placeholder="rose.mp3"
                value={action.file}
                onChange={(e) => updateAction(i, { file: e.target.value })}
              />
            )}
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, actions: s.actions.filter((_, idx) => idx !== i) }))}
            >
              Xoá
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, actions: [...s.actions, { type: "tts", template: "" }] }))}
          >
            + TTS
          </button>
          <button
            type="button"
            onClick={() => setState((s) => ({ ...s, actions: [...s.actions, { type: "sound", file: "" }] }))}
          >
            + Sound
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <ul style={{ color: "#f66" }} data-testid="builder-errors">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? "Đang tạo..." : "Tạo automation"}
      </button>
    </form>
  );
}
