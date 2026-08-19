import { useState } from "react";
import { api, type CurrentUser, type StatusResponse } from "./api-client.js";

interface Props {
  user: CurrentUser;
  status: StatusResponse | null;
  onUserUpdate: (user: CurrentUser) => void;
}

export function SettingsPanel({ user, status, onUserUpdate }: Props) {
  const [tiktokUsername, setTiktokUsername] = useState(user.tiktokUsername ?? "");
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLive = status?.connectionState === "connected" || status?.connectionState === "connecting";

  async function saveTiktokUsername() {
    setBusy(true);
    setMessage(null);
    try {
      await api.setTiktokUsername(tiktokUsername.trim() || null);
      onUserUpdate({ ...user, tiktokUsername: tiktokUsername.trim() || null });
      setMessage("Đã lưu username TikTok.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function startLive() {
    setBusy(true);
    setMessage(null);
    try {
      await api.startLive();
      setMessage("Đã bắt đầu theo dõi live.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function stopLive() {
    setBusy(true);
    try {
      await api.stopLive();
      setMessage("Đã dừng theo dõi live.");
    } finally {
      setBusy(false);
    }
  }

  async function getOverlayUrl() {
    const { url } = await api.createOverlayUrl();
    setOverlayUrl(url);
  }

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <h2>Cài đặt</h2>
      <label>
        TikTok username của bạn
        <div style={{ display: "flex", gap: 8 }}>
          <input value={tiktokUsername} onChange={(e) => setTiktokUsername(e.target.value)} placeholder="vd: mystreamer" />
          <button onClick={saveTiktokUsername} disabled={busy}>
            Lưu
          </button>
        </div>
      </label>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span>Trạng thái: {status?.connectionState ?? "idle"}</span>
        {isLive ? (
          <button onClick={stopLive} disabled={busy}>
            Dừng theo dõi
          </button>
        ) : (
          <button onClick={startLive} disabled={busy || !user.tiktokUsername}>
            Bắt đầu theo dõi
          </button>
        )}
      </div>

      <div>
        <button onClick={getOverlayUrl}>Tạo link Overlay (OBS Browser Source)</button>
        {overlayUrl && (
          <p style={{ wordBreak: "break-all", fontSize: 12 }}>
            <code>{overlayUrl}</code>
          </p>
        )}
      </div>

      {message && <p>{message}</p>}
    </section>
  );
}
