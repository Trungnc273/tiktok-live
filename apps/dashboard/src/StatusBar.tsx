import type { StatusResponse } from "./api-client.js";

const STATE_LABEL: Record<string, string> = {
  connected: "Đang live",
  connecting: "Đang kết nối",
  reconnecting: "Đang kết nối lại",
  disconnected: "Đã ngắt",
  error: "Lỗi",
  idle: "Chưa bắt đầu",
};

const STATE_DOT: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  disconnected: "bg-text-muted",
  error: "bg-danger",
  idle: "bg-text-muted",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}

export function StatusBar({ status }: { status: StatusResponse | null }) {
  const state = status?.connectionState ?? "idle";

  return (
    <section className="card space-y-3" data-testid="status-bar">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[state] ?? "bg-text-muted"}`} />
          <span className="font-semibold">{STATE_LABEL[state] ?? state}</span>
        </div>
        {status?.viewerCount != null && (
          <span className="text-sm text-text-muted">👁 {status.viewerCount.toLocaleString("vi-VN")}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="Follow" value={status?.counts.follow ?? 0} />
        <Stat label="Like" value={status?.counts.like ?? 0} />
        <Stat label="Comment" value={status?.counts.comment ?? 0} />
        <Stat label="Share" value={status?.counts.share ?? 0} />
        <Stat label="Gift" value={status?.counts.gift ?? 0} />
      </div>
    </section>
  );
}
