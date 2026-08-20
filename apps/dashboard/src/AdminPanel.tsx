import { useCallback, useEffect, useState } from "react";
import { api, type AdminUserRow } from "./api-client.js";

/** Chỉ hiển thị cho role === "admin" (xem App.tsx). */
export function AdminPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const refresh = useCallback(() => {
    api.listUsers().then(setUsers).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggle(u: AdminUserRow) {
    if (u.disabledAt) await api.enableUser(u.id);
    else await api.disableUser(u.id);
    refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Quản trị người dùng</h2>

      {users.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-text-muted">Chưa có người dùng nào.</p>
      ) : (
        <ul className="space-y-2" data-testid="admin-users-table">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.email}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span className="badge bg-surface text-text-muted">{u.role}</span>
                  <span>{u.tiktokUsername ?? "chưa gắn TikTok"}</span>
                  <span className={u.disabledAt ? "text-danger" : "text-success"}>
                    {u.disabledAt ? "Đã vô hiệu hoá" : "Hoạt động"}
                  </span>
                </p>
              </div>
              <button
                className={`btn shrink-0 !px-3 !py-1.5 text-xs ${u.disabledAt ? "btn-primary" : "btn-danger"}`}
                onClick={() => toggle(u)}
              >
                {u.disabledAt ? "Kích hoạt lại" : "Vô hiệu hoá"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
