import { useEffect, useState } from "react";
import {
  DEFAULT_TTS_LANGUAGE,
  TTS_LANGUAGES,
  FIELD_WHITELIST,
  type AutomationRule,
  type TriggerEventType,
} from "@tiktok-live/shared-types";
import {
  buildAutomationInput,
  emptyBuilderState,
  MIN_IDLE_SECONDS,
  ruleToBuilderState,
  validateBuilderState,
  type BuilderActionDraft,
  type BuilderState,
} from "./automation-builder-logic.js";
import { api, type CreateAutomationInput } from "./api-client.js";

const EVENT_TYPES: TriggerEventType[] = ["follow", "like", "comment", "share", "gift", "join", "idle"];
const EVENT_TYPE_LABEL: Partial<Record<TriggerEventType, string>> = {
  idle: "⏱ idle (im lặng quá lâu)",
};
const CONDITION_OPS = [
  "equals",
  "notEquals",
  "contains",
  "greaterThan",
  "lessThan",
  "greaterOrEqual",
  "lessOrEqual",
] as const;

interface SoundLibrary {
  builtin: { file: string; label: string }[];
  uploaded: string[];
}

interface Props {
  /** Automation đang sửa (từ "✏️ Sửa" trong AutomationsList) — null/undefined = đang tạo mới. */
  editing?: AutomationRule | null;
  onCreate: (input: CreateAutomationInput) => Promise<void>;
  onUpdate?: (id: string, input: CreateAutomationInput) => Promise<void>;
  onCancelEdit?: () => void;
}

/**
 * Automation Builder (docs/promp/PHASE_11.md): người không biết code tạo được
 * "Gift Rose -> TTS + Sound" chỉ qua form WHEN/IF/THEN, không viết JSON tay.
 * MVP: điều kiện chỉ hỗ trợ 1 so sánh đơn (không có UI cây AND/OR lồng nhau) —
 * ưu tiên đơn giản theo đúng PHASE 11 ("Simplicity > đầy đủ tính năng"); engine
 * (RULE-ENGINE.md) vẫn hỗ trợ đầy đủ AND/OR, UI phức tạp hơn để dành cho Phase 2.
 *
 * Cũng dùng chung form này cho SỬA (edit) automation đã tồn tại — xem prop
 * `editing`, và cho "nghe thử" TTS/sound trước khi lưu (yêu cầu người dùng: "nghe
 * trước hiệu ứng... đảm bảo dễ dùng") qua nút 🔊 cạnh mỗi action.
 */
export function AutomationBuilder({ onCreate, onUpdate, onCancelEdit, editing }: Props) {
  const [state, setState] = useState<BuilderState>(emptyBuilderState());
  const [conditionEnabled, setConditionEnabled] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewingIndex, setPreviewingIndex] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [soundLibrary, setSoundLibrary] = useState<SoundLibrary>({ builtin: [], uploaded: [] });
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const availableFields = FIELD_WHITELIST[state.triggerEventType];

  function refreshSoundLibrary() {
    api.listSounds().then(setSoundLibrary).catch(console.error);
  }

  useEffect(() => {
    refreshSoundLibrary();
  }, []);

  useEffect(() => {
    if (editing) {
      const s = ruleToBuilderState(editing);
      setState(s);
      setConditionEnabled(s.condition !== null);
    } else {
      setState(emptyBuilderState());
      setConditionEnabled(false);
    }
    setErrors([]);
    setPreviewError(null);
  }, [editing]);

  function updateAction(index: number, patch: Partial<BuilderActionDraft>) {
    setState((s) => ({
      ...s,
      actions: s.actions.map((a, i) => (i === index ? ({ ...a, ...patch } as BuilderActionDraft) : a)),
    }));
  }

  async function previewAction(index: number, action: BuilderActionDraft) {
    setPreviewError(null);
    setPreviewingIndex(index);
    try {
      if (action.type === "tts") {
        if (action.template.trim().length === 0) throw new Error("Chưa nhập nội dung để nghe thử");
        // Thay {username}... bằng giá trị mẫu, vì đây là preview lúc soạn form,
        // chưa có event thật để lấy biến — chỉ cần nghe được GIỌNG ĐỌC thật.
        const sampleText = action.template.replace(/\{(\w+)\}/g, (_m, name: string) => `[${name} mẫu]`);
        const { url } = await api.previewTts(sampleText, action.lang);
        await new Audio(url).play();
      } else {
        if (action.file.trim().length === 0) throw new Error("Chưa nhập tên file để nghe thử");
        await new Audio(`/sounds/${action.file.trim()}`).play();
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Không nghe thử được — kiểm tra lại nội dung/tên file");
    } finally {
      setPreviewingIndex(null);
    }
  }

  async function uploadSound(index: number, file: File) {
    setPreviewError(null);
    setUploadingIndex(index);
    try {
      const { file: savedName } = await api.uploadSound(file);
      updateAction(index, { file: savedName });
      refreshSoundLibrary();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Upload thất bại");
    } finally {
      setUploadingIndex(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateBuilderState(state);
    setErrors(validation.errors);
    if (!validation.valid) return;

    setSubmitting(true);
    try {
      if (editing && onUpdate) {
        await onUpdate(editing.id, buildAutomationInput(state));
        onCancelEdit?.();
      } else {
        await onCreate(buildAutomationInput(state));
        setState(emptyBuilderState());
        setConditionEnabled(false);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Lưu automation thất bại"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="automation-builder" className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{editing ? `Sửa: ${editing.name}` : "Tạo automation mới"}</h2>
        {editing && (
          <button type="button" className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={onCancelEdit}>
            Huỷ sửa
          </button>
        )}
      </div>

      <label className="block">
        Tên automation
        <input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Ví dụ: Gift Rose -> Cảm ơn"
        />
      </label>

      <label className="block">
        WHEN (trigger)
        <select
          value={state.triggerEventType}
          onChange={(e) =>
            setState((s) => ({ ...s, triggerEventType: e.target.value as TriggerEventType, condition: null }))
          }
        >
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </label>

      {state.triggerEventType === "idle" && (
        <label className="block">
          Nói lại sau mỗi (giây) khi im lặng
          <input
            type="number"
            min={MIN_IDLE_SECONDS}
            max={3600}
            value={state.idleSeconds}
            onChange={(e) => setState((s) => ({ ...s, idleSeconds: Number(e.target.value) }))}
          />
          <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-text-muted">
            Live không có follow/like/comment/gift/share nào trong ngần ấy giây -&gt; tự chạy action bên dưới, lặp
            lại mỗi {state.idleSeconds || MIN_IDLE_SECONDS}s trong lúc vẫn im lặng.
          </span>
        </label>
      )}

      <div className="space-y-2 rounded-xl bg-surface-2 p-3">
        <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal text-text">
          <input
            type="checkbox"
            checked={conditionEnabled}
            onChange={(e) => setConditionEnabled(e.target.checked)}
            className="h-4 w-4 shrink-0"
            disabled={availableFields.length === 0}
          />
          IF (điều kiện, tuỳ chọn){availableFields.length === 0 && " — không có field khả dụng cho trigger này"}
        </label>
        {conditionEnabled && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select
              className="col-span-2 sm:col-span-1"
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
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">THEN (actions)</p>
        {state.actions.map((action, i) => (
          <div key={i} className="space-y-1.5 rounded-lg bg-surface p-2">
            <div className="flex gap-2">
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
                className="btn btn-ghost shrink-0 !px-2.5"
                onClick={() => previewAction(i, action)}
                disabled={previewingIndex === i}
                aria-label={`Nghe thử action ${i + 1}`}
                title="Nghe thử"
              >
                {previewingIndex === i ? "…" : "🔊"}
              </button>
              <button
                type="button"
                className="btn btn-ghost shrink-0 !px-2.5 text-danger"
                onClick={() => setState((s) => ({ ...s, actions: s.actions.filter((_, idx) => idx !== i) }))}
                aria-label="Xoá action"
                title="Xoá"
              >
                🗑
              </button>
            </div>
            {action.type === "tts" && (
              <label className="flex items-center gap-2 text-xs font-normal normal-case tracking-normal text-text-muted">
                Ngôn ngữ đọc
                <select
                  className="!py-1 text-xs"
                  value={action.lang}
                  onChange={(e) => updateAction(i, { lang: e.target.value })}
                >
                  {TTS_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {action.type === "sound" && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-normal normal-case tracking-normal text-text-muted">
                <label className="flex items-center gap-2">
                  Chọn có sẵn
                  <select
                    className="!py-1 text-xs"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) updateAction(i, { file: e.target.value });
                    }}
                  >
                    <option value="">-- danh sách --</option>
                    {soundLibrary.builtin.length > 0 && (
                      <optgroup label="Có sẵn hệ thống">
                        {soundLibrary.builtin.map((s) => (
                          <option key={s.file} value={s.file}>
                            {s.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {soundLibrary.uploaded.length > 0 && (
                      <optgroup label="Đã tải lên">
                        {soundLibrary.uploaded.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <label className="btn btn-ghost cursor-pointer !py-1 text-xs">
                  {uploadingIndex === i ? "Đang tải lên…" : "⬆ Tải lên (điện thoại/máy tính)"}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,.mp3,.wav"
                    className="hidden"
                    disabled={uploadingIndex === i}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = ""; // cho phép chọn lại cùng 1 file lần sau
                      if (file) void uploadSound(i, file);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
        {previewError && <p className="text-xs text-danger">{previewError}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost flex-1 text-sm"
            onClick={() =>
              setState((s) => ({
                ...s,
                actions: [...s.actions, { type: "tts", template: "", lang: DEFAULT_TTS_LANGUAGE }],
              }))
            }
          >
            + TTS
          </button>
          <button
            type="button"
            className="btn btn-ghost flex-1 text-sm"
            onClick={() => setState((s) => ({ ...s, actions: [...s.actions, { type: "sound", file: "" }] }))}
          >
            + Sound
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" data-testid="builder-errors">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
        {submitting ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo automation"}
      </button>
    </form>
  );
}
