import { useState } from "react";
import { api, type CurrentUser } from "./api-client.js";

interface Props {
  onAuthenticated: (user: CurrentUser) => void;
}

/** Đăng nhập/đăng ký đơn giản (email + mật khẩu, không xác minh email) — theo yêu cầu người dùng. */
export function AuthForm({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", display: "grid", gap: 16 }}>
      <h1 style={{ textAlign: "center" }}>TikTok LIVE Automation</h1>
      <form onSubmit={handleSubmit} data-testid="auth-form" style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p style={{ color: "#f66" }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
      </form>
      <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
      </button>
    </div>
  );
}
