import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "../AuthForm.js";

describe("AuthForm", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("mặc định ở chế độ đăng nhập, gọi /api/auth/login đúng payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", email: "a@test.com", role: "user", tiktokUsername: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<AuthForm onAuthenticated={onAuthenticated} />);

    const form = screen.getByTestId("auth-form");
    await user.type(within(form).getByLabelText("Email"), "a@test.com");
    await user.type(within(form).getByLabelText("Mật khẩu"), "password123");
    await user.click(within(form).getByText("Đăng nhập"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onAuthenticated).toHaveBeenCalledWith({ id: "1", email: "a@test.com", role: "user", tiktokUsername: null });
  });

  it("chuyển sang đăng ký -> gọi /api/auth/register", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "1", email: "new@test.com", role: "admin", tiktokUsername: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<AuthForm onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByText("Chưa có tài khoản? Đăng ký"));
    const form = screen.getByTestId("auth-form");
    await user.type(within(form).getByLabelText("Email"), "new@test.com");
    await user.type(within(form).getByLabelText("Mật khẩu"), "password123");
    await user.click(within(form).getByText("Đăng ký"));

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
  });

  it("hiển thị lỗi khi API trả về thất bại, không gọi onAuthenticated", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Sai email hoặc mật khẩu" }),
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<AuthForm onAuthenticated={onAuthenticated} />);

    const form = screen.getByTestId("auth-form");
    await user.type(within(form).getByLabelText("Email"), "a@test.com");
    await user.type(within(form).getByLabelText("Mật khẩu"), "wrongpass");
    await user.click(within(form).getByText("Đăng nhập"));

    expect(await screen.findByText("Sai email hoặc mật khẩu")).toBeTruthy();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
