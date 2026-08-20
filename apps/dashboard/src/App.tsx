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

type Tab = "status" | "automations" | "admin";

export function App() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined); // undefined = đang tải
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [tab, setTab] = useState<Tab>("status");
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

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

    // transports: ["websocket"] — bỏ qua bước "nâng cấp" từ HTTP long-polling hay
    // bị ngắt giữa chừng khi đi qua Cloudflare Tunnel (xem ghi chú tương tự ở overlay/App.tsx).
    const socket = io(`${window.location.origin}/dashboard`, { path: "/socket.io", transports: ["websocket"] });
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

  async function handleUpdate(id: string, input: CreateAutomationInput) {
    await api.updateAutomation(id, input);
    refreshAutomations();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await api.updateAutomation(id, { enabled });
    refreshAutomations();
  }

  async function handleDelete(id: string) {
    if (editingRule?.id === id) setEditingRule(null);
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

  if (user === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-text-muted">
        <p>Đang tải...</p>
      </div>
    );
  }
  if (user === null) return <AuthForm onAuthenticated={setUser} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: "status", label: "Trạng thái" },
    { id: "automations", label: "Automations" },
    ...(user.role === "admin" ? ([{ id: "admin", label: "Quản trị" }] as const) : []),
  ];

  return (
    <div className="min-h-dvh pb-10">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">
              TikTok<span className="text-accent">LIVE</span>
            </span>
            <span className="hidden text-sm text-text-muted sm:inline">Automation</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden max-w-[140px] truncate text-text-muted sm:inline">{user.email}</span>
            {user.role === "admin" && <span className="badge bg-accent-2/15 text-accent-2">admin</span>}
            <button className="btn btn-ghost !px-3 !py-1.5 text-sm" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-accent text-[#04211f]" : "text-text-muted hover:bg-surface-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-5">
        {tab === "status" && (
          <>
            <StatusBar status={status} />
            <SettingsPanel user={user} status={status} onUserUpdate={setUser} />
          </>
        )}

        {tab === "automations" && (
          <>
            <section className="card space-y-3">
              <h2 className="text-base font-semibold">Automations của bạn</h2>
              <AutomationsList
                automations={automations}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onEdit={setEditingRule}
              />
            </section>
            <AutomationBuilder
              editing={editingRule}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onCancelEdit={() => setEditingRule(null)}
            />
          </>
        )}

        {tab === "admin" && user.role === "admin" && <AdminPanel />}
      </main>
    </div>
  );
}
