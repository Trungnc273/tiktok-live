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
    render(
      <AutomationsList automations={[]} onToggle={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} onEdit={vi.fn()} />,
    );
    expect(screen.getByTestId("automations-empty")).toBeTruthy();
  });

  it("hiển thị đúng danh sách automation", () => {
    render(
      <AutomationsList
        automations={[rule({ id: "a" }), rule({ id: "b", name: "Rule B" })]}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByTestId("automation-row-a")).toBeTruthy();
    expect(screen.getByText("Rule B")).toBeTruthy();
  });

  it("gọi onToggle/onDelete/onDuplicate/onEdit đúng id khi bấm", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const onEdit = vi.fn();
    render(
      <AutomationsList
        automations={[rule({ id: "a", enabled: true })]}
        onToggle={onToggle}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByLabelText("toggle-Test rule"));
    expect(onToggle).toHaveBeenCalledWith("a", false);

    await user.click(screen.getByRole("button", { name: "Sửa Test rule" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));

    await user.click(screen.getByRole("button", { name: "Xoá Test rule" }));
    expect(onDelete).toHaveBeenCalledWith("a");

    await user.click(screen.getByRole("button", { name: "Nhân bản Test rule" }));
    expect(onDuplicate).toHaveBeenCalledWith("a");
  });

  it("bấm vào tên automation mở rộng xem chi tiết trigger/action", async () => {
    const user = userEvent.setup();
    render(
      <AutomationsList
        automations={[rule({ id: "a" })]}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("automation-detail-a")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Chi tiết Test rule" }));
    expect(screen.getByTestId("automation-detail-a")).toBeTruthy();
    expect(screen.getByText('Đọc (Tiếng Việt): "hi"')).toBeTruthy();
  });
});
