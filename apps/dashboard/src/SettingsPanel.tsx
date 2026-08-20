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
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLive = status?.connectionState === "connected" || status?.connectionState === "connecting";
  const savedUsername = user.tiktokUsername;
  // Đang live NHƯNG khác kênh với username vừa lưu -> vẫn cho phép "chuyển kênh"
  // ngay (start() ở backend tự dừng phiên cũ rồi bắt đầu phiên mới), không bắt
  // người dùng phải tự bấm Dừng rồi bấm Bắt đầu theo dõi thành 2 bước.
  const channelMismatch = isLive && !!savedUsername && savedUsername !== status?.activeTikTokUsername;

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
    // Mở tab trống NGAY trong tick xử lý click (trước await) — nhiều trình duyệt
    // (đặc biệt Safari/iOS) chỉ cho window.open() không bị chặn popup nếu gọi
    // đồng bộ trực tiếp trong lúc xử lý sự kiện click; gọi sau 1 await coi như
    // không còn "trong lúc người dùng tương tác" nữa -> bị chặn im lặng. Yêu cầu
    // người dùng: "một số người không biết copy" -> tự mở tab luôn, đỡ phải dán tay.
    const newTab = window.open("", "_blank");
    const { url } = await api.createOverlayUrl();
    setOverlayUrl(url);
    setCopied(false);
    if (newTab) newTab.location.href = url;
  }

  function openOverlayUrl() {
    if (overlayUrl) window.open(overlayUrl, "_blank", "noopener,noreferrer");
  }

  async function copyOverlayUrl() {
    if (!overlayUrl) return;
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API có thể không khả dụng (http không có HTTPS) — người dùng tự copy tay từ ô input.
    }
  }

  return (
    <section className="card space-y-5">
      <h2 className="text-base font-semibold">Cài đặt</h2>

      <div>
        <label htmlFor="tiktok-username">TikTok username của bạn</label>
        <div className="flex gap-2">
          <input
            id="tiktok-username"
            value={tiktokUsername}
            onChange={(e) => setTiktokUsername(e.target.value)}
            placeholder="vd: mystreamer"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn btn-ghost shrink-0" onClick={saveTiktokUsername} disabled={busy}>
            Lưu
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {channelMismatch ? (
          <button className="btn btn-primary flex-1 sm:flex-none" onClick={startLive} disabled={busy}>
            🔁 Chuyển sang @{savedUsername}
          </button>
        ) : isLive ? (
          <button className="btn btn-danger flex-1 sm:flex-none" onClick={stopLive} disabled={busy}>
            ⏹ Dừng theo dõi
          </button>
        ) : (
          <button
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={startLive}
            disabled={busy || !user.tiktokUsername}
          >
            ▶ Bắt đầu theo dõi
          </button>
        )}
        {!user.tiktokUsername && (
          <span className="text-xs text-text-muted">Nhập và lưu username TikTok trước đã</span>
        )}
      </div>

      {status?.activeTikTokUsername && (
        <p className="text-xs text-text-muted">
          Đang theo dõi thật: <span className="font-medium text-text">@{status.activeTikTokUsername}</span>
          {channelMismatch && (
            <span className="ml-1 text-warning">(khác với @{savedUsername} vừa lưu — bấm "🔁 Chuyển sang" ở trên)</span>
          )}
        </p>
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Link Overlay</p>
            <p className="text-xs text-text-muted">Mở link này trên điện thoại/thiết bị đặt gần lúc live để hiện hiệu ứng.</p>
          </div>
          <button className="btn btn-primary shrink-0 text-sm" onClick={getOverlayUrl}>
            {overlayUrl ? "↗ Mở tab mới" : "Tạo & mở link"}
          </button>
        </div>
        {overlayUrl && (
          <div className="flex gap-2">
            <input readOnly value={overlayUrl} className="text-xs" onFocus={(e) => e.target.select()} />
            <button className="btn btn-ghost shrink-0 text-sm" onClick={openOverlayUrl} title="Mở lại tab overlay">
              ↗ Mở
            </button>
            <button className="btn btn-ghost shrink-0 text-sm" onClick={copyOverlayUrl}>
              {copied ? "Đã copy ✓" : "Copy"}
            </button>
          </div>
        )}
      </div>

      {message && <p className="text-sm text-text-muted">{message}</p>}
    </section>
  );
}
