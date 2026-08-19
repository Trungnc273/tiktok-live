import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { AutomationRule, OverlayMessage } from "@tiktok-live/shared-types";
import { api, type CreateAutomationInput, type CurrentUser, type StatusResponse } from "./api-client.js";
import { AutomationsList } from "./AutomationsList.js";
import { AutomationBuilder } from "./AutomationBuilder.js";
import { StatusBar } from "./StatusBar.js";
import { AuthForm } from "./AuthForm.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { AdminPanel } from "./AdminPanel.js";

export function App() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined); // undefined = đang tải
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  const refreshAutomations = useCallback(() => {
    api.listAutomations().then(setAutomations).catch(console.error);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAutomations();
    api.getStatus().then(setStatus).catch(console.error);

    // Dashboard namespace (M09, xác thực JWT cookie từ bản multi-tenant) — realtime
    // status thay vì polling, cập nhật connectionState/counts khi có LiveEvent mới.
    const socket = io(`${window.location.origin}/dashboard`, { path: "/socket.io" });
    socket.on("message", (message: OverlayMessage) => {
      if (message.type === "liveEvent") {
        api.getStatus().then(setStatus).catch(console.error);
      }
    });

    return () => {
      socket.close();
    };
  }, [user, refreshAutomations]);

  async function handleCreate(input: CreateAutomationInput) {
    await api.createAutomation(input);
    refreshAutomations();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await api.updateAutomation(id, { enabled });
    refreshAutomations();
  }

  async function handleDelete(id: string) {
    await api.deleteAutomation(id);
    refreshAutomations();
  }

  async function handleDuplicate(id: string) {
    await api.duplicateAutomation(id);
    refreshAutomations();
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (user === undefined) return <p style={{ padding: 24 }}>Đang tải...</p>;
  if (user === null) return <AuthForm onAuthenticated={setUser} />;

  return (
    <div style={{ padding: 24, display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>TikTok LIVE Automation Dashboard</h1>
        <div>
          <span style={{ marginRight: 12 }}>
            {user.email} {user.role === "admin" && "(admin)"}
          </span>
          <button onClick={handleLogout}>Đăng xuất</button>
        </div>
      </div>

      <StatusBar status={status} />

      <SettingsPanel user={user} status={status} onUserUpdate={setUser} />

      <section>
        <h2>Automations</h2>
        <AutomationsList
          automations={automations}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      </section>
      <section>
        <h2>Tạo automation mới</h2>
        <AutomationBuilder onCreate={handleCreate} />
      </section>

      {user.role === "admin" && <AdminPanel />}
    </div>
  );
}
