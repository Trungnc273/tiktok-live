import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutomationBuilder } from "../AutomationBuilder.js";

describe("AutomationBuilder — tạo automation không cần viết code (PRD acceptance criteria)", () => {
  it("người dùng chọn Gift Rose -> Sound + TTS chỉ qua UI (không gõ JSON tay)", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<AutomationBuilder onCreate={onCreate} />);

    const form = screen.getByTestId("automation-builder");

    await user.type(within(form).getByLabelText("Tên automation"), "Gift Rose -> Cảm ơn");

    const triggerSelect = within(form).getByLabelText("WHEN (trigger)");
    await user.selectOptions(triggerSelect, "gift");

    await user.click(within(form).getByLabelText("IF (điều kiện, tuỳ chọn)"));
    const [fieldSelect, opSelect] = within(form).getAllByRole("combobox").slice(1); // [0] là trigger
    await user.selectOptions(fieldSelect, "payload.giftName");
    await user.selectOptions(opSelect, "equals");
    await user.type(within(form).getByPlaceholderText("giá trị"), "Rose");

    await user.click(within(form).getByText("+ Sound"));
    await user.type(within(form).getByPlaceholderText("rose.mp3"), "rose.mp3");

    await user.click(within(form).getByText("+ TTS"));
    // Dùng fireEvent.change thay vì userEvent.type() vì "{" "}" là cú pháp phím đặc
    // biệt của userEvent (không phải ký tự literal) — fireEvent tránh hoàn toàn vấn đề này.
    fireEvent.change(within(form).getByPlaceholderText("Cảm ơn {username}!"), {
      target: { value: "Cam on {username} da tang Rose!" },
    });

    await user.click(within(form).getByText("Tạo automation"));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      name: "Gift Rose -> Cảm ơn",
      enabled: true,
      priority: 100,
      trigger: { eventType: "gift" },
      conditions: { op: "equals", field: "payload.giftName", value: "Rose" },
      actions: [
        { type: "sound", payload: { file: "rose.mp3" } },
        { type: "tts", payload: { template: "Cam on {username} da tang Rose!" } },
      ],
    });
  });

  it("báo lỗi thay vì gọi API khi chưa có action nào", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<AutomationBuilder onCreate={onCreate} />);
    const form = screen.getByTestId("automation-builder");

    await user.type(within(form).getByLabelText("Tên automation"), "test");
    await user.click(within(form).getByText("Tạo automation"));

    expect(onCreate).not.toHaveBeenCalled();
    expect(within(form).getByTestId("builder-errors")).toBeTruthy();
  });
});
