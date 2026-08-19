import type { StatusResponse } from "./api-client.js";

export function StatusBar({ status }: { status: StatusResponse | null }) {
  if (!status) return <div data-testid="status-bar">Đang tải trạng thái...</div>;

  return (
    <div data-testid="status-bar" style={{ display: "flex", gap: 16 }}>
      <span>Trạng thái: {status.connectionState}</span>
      <span>Viewer: {status.viewerCount ?? "-"}</span>
      <span>Follow: {status.counts.follow ?? 0}</span>
      <span>Like: {status.counts.like ?? 0}</span>
      <span>Comment: {status.counts.comment ?? 0}</span>
      <span>Gift: {status.counts.gift ?? 0}</span>
    </div>
  );
}
