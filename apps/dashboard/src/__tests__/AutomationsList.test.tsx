import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AutomationRule } from "@tiktok-live/shared-types";
import { AutomationsList } from "../AutomationsList.js";

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: "r1",
    name: "Test rule",
    enabled: true,
    priority: 100,
    trigger: { eventType: "gift" },
    conditions: null,
    actions: [{ type: "tts", payload: { template: "hi" } }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AutomationsList", () => {
  it("hiển thị thông báo rỗng khi chưa có automation", () => {
    render(<AutomationsList automations={[]} onToggle={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} />);
    expect(screen.getByTestId("automations-empty")).toBeTruthy();
  });

  it("hiển thị đúng danh sách automation", () => {
    render(
      <AutomationsList
        automations={[rule({ id: "a" }), rule({ id: "b", name: "Rule B" })]}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("automation-row-a")).toBeTruthy();
    expect(screen.getByText("Rule B")).toBeTruthy();
  });

  it("gọi onToggle/onDelete/onDuplicate đúng id khi bấm", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    render(
      <AutomationsList
        automations={[rule({ id: "a", enabled: true })]}
        onToggle={onToggle}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />,
    );

    await user.click(screen.getByLabelText("toggle-Test rule"));
    expect(onToggle).toHaveBeenCalledWith("a", false);

    await user.click(screen.getByText("Xoá"));
    expect(onDelete).toHaveBeenCalledWith("a");

    await user.click(screen.getByText("Nhân bản"));
    expect(onDuplicate).toHaveBeenCalledWith("a");
  });
});
