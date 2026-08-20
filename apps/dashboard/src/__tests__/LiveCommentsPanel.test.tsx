import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveCommentsPanel, type DisplayedComment } from "../LiveCommentsPanel.js";
import { api } from "../api-client.js";

vi.mock("../api-client.js", () => ({
  api: {
    translateComment: vi.fn(),
    replyComment: vi.fn(),
  },
}));

function comment(overrides: Partial<DisplayedComment> = {}): DisplayedComment {
  return { id: "c1", nickname: "Fan A", username: "fan_a", text: "hi", receivedAt: Date.now(), ...overrides };
}

describe("LiveCommentsPanel — khoá danh sách khi đọc & dịch (yêu cầu người dùng: live đông bình luận nhảy liên tục)", () => {
  it("bấm 'Đọc & dịch' -> danh sách khoá lại, bình luận mới hơn KHÔNG hiện ngay, có nút '↓ N bình luận mới'", async () => {
    vi.mocked(api.translateComment).mockResolvedValue({
      translatedText: "chào",
      detectedSourceLang: "en",
      url: "http://x/media/a.wav",
    });

    const user = userEvent.setup();
    const { rerender } = render(
      <LiveCommentsPanel comments={[comment({ id: "c2", text: "second" }), comment({ id: "c1", text: "first" })]} />,
    );

    // Chọn bình luận "c1" (cũ hơn) để đọc & dịch.
    const rowC1 = screen.getByText("first").closest("li")!;
    await user.click(within(rowC1).getByRole("button", { name: "🌐 Đọc & dịch" }));

    // Có thêm 2 bình luận mới hơn "c1" đổ về trong lúc đang xử lý (mô phỏng live đông).
    rerender(
      <LiveCommentsPanel
        comments={[
          comment({ id: "c4", text: "fourth" }),
          comment({ id: "c3", text: "third" }),
          comment({ id: "c2", text: "second" }),
          comment({ id: "c1", text: "first" }),
        ]}
      />,
    );

    // Danh sách khoá tại NGUYÊN TRẠNG lúc bấm — "first" và "second" (đã thấy
    // trước đó) vẫn còn, chỉ "third"/"fourth" (phát sinh SAU khi khoá) bị giữ lại.
    expect(screen.queryByText("third")).toBeNull();
    expect(screen.queryByText("fourth")).toBeNull();
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
    expect(screen.getByRole("button", { name: "↓ 2 bình luận mới — bấm để xem tiếp" })).toBeTruthy();

    // Bấm nút -> mở khoá, hiện đủ toàn bộ.
    await user.click(screen.getByRole("button", { name: "↓ 2 bình luận mới — bấm để xem tiếp" }));
    expect(screen.getByText("third")).toBeTruthy();
    expect(screen.getByText("fourth")).toBeTruthy();
  });
});
