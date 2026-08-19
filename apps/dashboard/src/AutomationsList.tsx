import type { AutomationRule } from "@tiktok-live/shared-types";

interface Props {
  automations: AutomationRule[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function AutomationsList({ automations, onToggle, onDelete, onDuplicate }: Props) {
  if (automations.length === 0) {
    return <p data-testid="automations-empty">Chưa có automation nào. Tạo 1 cái ở form bên dưới.</p>;
  }

  return (
    <table data-testid="automations-table">
      <thead>
        <tr>
          <th>Tên</th>
          <th>Trigger</th>
          <th>Actions</th>
          <th>Bật</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {automations.map((rule) => (
          <tr key={rule.id} data-testid={`automation-row-${rule.id}`}>
            <td>{rule.name}</td>
            <td>{rule.trigger.eventType}</td>
            <td>{rule.actions.map((a) => a.type).join(", ")}</td>
            <td>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => onToggle(rule.id, e.target.checked)}
                aria-label={`toggle-${rule.name}`}
              />
            </td>
            <td>
              <button onClick={() => onDuplicate(rule.id)}>Nhân bản</button>
              <button onClick={() => onDelete(rule.id)}>Xoá</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
