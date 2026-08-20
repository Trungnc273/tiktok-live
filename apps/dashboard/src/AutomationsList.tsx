import { useState } from "react";
import { TTS_LANGUAGES, type AutomationRule } from "@tiktok-live/shared-types";
import { hasUnsupportedActions } from "./automation-builder-logic.js";
import { api } from "./api-client.js";

const LANG_LABEL: Record<string, string> = Object.fromEntries(TTS_LANGUAGES.map((l) => [l.code, l.label]));

interface Props {
  automations: AutomationRule[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onEdit: (rule: AutomationRule) => void;
}

const ACTION_ICON: Record<string, string> = {
  tts: "🗣",
  sound: "🔊",
  "obs.sceneChange": "🎬",
};

const CONDITION_OP_LABEL: Record<string, string> = {
  equals: "=",
  notEquals: "≠",
  contains: "chứa",
  greaterThan: ">",
  lessThan: "<",
  greaterOrEqual: "≥",
  lessOrEqual: "≤",
};

function describeCondition(rule: AutomationRule): string | null {
  const c = rule.conditions;
  if (!c) return null;
  if (!("field" in c)) return "điều kiện phức tạp (AND/OR)";
  return `${c.field} ${CONDITION_OP_LABEL[c.op] ?? c.op} ${c.value}`;
}

function describeAction(action: AutomationRule["actions"][number]): string {
  if (action.type === "tts") {
    const payload = action.payload as { template?: string; lang?: string };
    const langLabel = payload.lang ? LANG_LABEL[payload.lang] ?? payload.lang : LANG_LABEL.vi;
    return `Đọc (${langLabel}): "${payload.template ?? ""}"`;
  }
  if (action.type === "sound") return `Phát âm thanh: ${(action.payload as { file?: string })?.file ?? ""}`;
  return action.type;
}

export function AutomationsList({ automations, onToggle, onDelete, onDuplicate, onEdit }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function previewAction(rowKey: string, action: AutomationRule["actions"][number]) {
    setPreviewError(null);
    setPreviewingKey(rowKey);
    try {
      if (action.type === "tts") {
        const payload = action.payload as { template?: string; lang?: string };
        const sampleText = (payload.template ?? "").replace(/\{(\w+)\}/g, (_m, name: string) => `[${name} mẫu]`);
        if (sampleText.trim().length === 0) throw new Error("Nội dung TTS rỗng");
        const { url } = await api.previewTts(sampleText, payload.lang);
        await new Audio(url).play();
      } else if (action.type === "sound") {
        const file = (action.payload as { file?: string })?.file ?? "";
        if (file.trim().length === 0) throw new Error("Chưa có tên file");
        await new Audio(`/sounds/${file.trim()}`).play();
      } else {
        throw new Error("Loại action này chưa hỗ trợ nghe thử");
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Không nghe thử được");
    } finally {
      setPreviewingKey(null);
    }
  }

  if (automations.length === 0) {
    return (
      <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-text-muted" data-testid="automations-empty">
        Chưa có automation nào. Tạo 1 cái ở form bên dưới.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="automations-table">
      {automations.map((rule) => {
        const expanded = expandedId === rule.id;
        const conditionText = describeCondition(rule);
        return (
          <li
            key={rule.id}
            data-testid={`automation-row-${rule.id}`}
            className="rounded-xl bg-surface-2 px-3.5 py-3"
          >
            <div className="flex items-center gap-3">
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => onToggle(rule.id, e.target.checked)}
                  aria-label={`toggle-${rule.name}`}
                  className="peer sr-only"
                />
                <span className="h-6 w-10 rounded-full bg-border transition-colors peer-checked:bg-accent" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </label>

              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setExpandedId(expanded ? null : rule.id)}
                aria-expanded={expanded}
                aria-label={`Chi tiết ${rule.name}`}
              >
                <p className="truncate text-sm font-medium">{rule.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="badge bg-surface text-text-muted">{rule.trigger.eventType}</span>
                  <span>{rule.actions.map((a) => ACTION_ICON[a.type] ?? a.type).join(" ")}</span>
                  <span className="ml-auto shrink-0 text-text-muted">{expanded ? "▲" : "▼"}</span>
                </p>
              </button>

              <div className="flex shrink-0 gap-1.5">
                <button
                  className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
                  onClick={() => onEdit(rule)}
                  aria-label={`Sửa ${rule.name}`}
                  title="Sửa"
                >
                  ✏️
                </button>
                <button
                  className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
                  onClick={() => onDuplicate(rule.id)}
                  aria-label={`Nhân bản ${rule.name}`}
                  title="Nhân bản"
                >
                  ⧉
                </button>
                <button
                  className="btn btn-ghost !px-2.5 !py-1.5 text-xs text-danger"
                  onClick={() => onDelete(rule.id)}
                  aria-label={`Xoá ${rule.name}`}
                  title="Xoá"
                >
                  🗑
                </button>
              </div>
            </div>

            {expanded && (
              <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs" data-testid={`automation-detail-${rule.id}`}>
                <p className="text-text-muted">
                  WHEN <span className="font-medium text-text">{rule.trigger.eventType}</span>
                  {conditionText && (
                    <>
                      {" "}
                      IF <span className="font-medium text-text">{conditionText}</span>
                    </>
                  )}
                </p>
                <ul className="space-y-1.5">
                  {rule.actions.map((action, i) => {
                    const rowKey = `${rule.id}-${i}`;
                    const canPreview = action.type === "tts" || action.type === "sound";
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-text-muted">{describeAction(action)}</span>
                        {canPreview && (
                          <button
                            type="button"
                            className="btn btn-ghost shrink-0 !px-2 !py-1 text-xs"
                            onClick={() => previewAction(rowKey, action)}
                            disabled={previewingKey === rowKey}
                            aria-label={`Nghe thử ${describeAction(action)}`}
                            title="Nghe thử"
                          >
                            {previewingKey === rowKey ? "…" : "🔊 Nghe"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {hasUnsupportedActions(rule) && (
                  <p className="text-warning">
                    ⚠ Automation này có action không sửa được qua form đơn giản (vd OBS scene) — bấm "Sửa" sẽ chỉ
                    cho phép chỉnh phần TTS/Sound.
                  </p>
                )}
                {previewError && previewingKey === null && <p className="text-danger">{previewError}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
