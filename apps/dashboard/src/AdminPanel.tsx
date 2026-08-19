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
    <section>
      <h2>Quản trị người dùng</h2>
      <table data-testid="admin-users-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Vai trò</th>
            <th>TikTok</th>
            <th>Trạng thái</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.tiktokUsername ?? "-"}</td>
              <td>{u.disabledAt ? "Đã vô hiệu hoá" : "Hoạt động"}</td>
              <td>
                <button onClick={() => toggle(u)}>{u.disabledAt ? "Kích hoạt lại" : "Vô hiệu hoá"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
