import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { AutomationRule, OverlayMessage } from "@tiktok-live/shared-types";
import { api, type CreateAutomationInput, type StatusResponse } from "./api-client.js";
import { AutomationsList } from "./AutomationsList.js";
import { AutomationBuilder } from "./AutomationBuilder.js";
import { StatusBar } from "./StatusBar.js";

export function App() {
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const refreshAutomations = useCallback(() => {
    api.listAutomations().then(setAutomations).catch(console.error);
  }, []);

  useEffect(() => {
    refreshAutomations();
    api.getStatus().then(setStatus).catch(console.error);

    // Dashboard namespace (M09) — realtime status thay vì polling, cập nhật
    // connectionState/counts khi có LiveEvent mới. Không cần token ở MVP local.
    const socket = io(`${window.location.origin}/dashboard`, { path: "/socket.io" });
    socket.on("message", (message: OverlayMessage) => {
      if (message.type === "liveEvent") {
        // Refetch status sau mỗi liveEvent — đơn giản, đủ cho MVP (thay vì tính lại counts phía client).
        api.getStatus().then(setStatus).catch(console.error);
      }
    });

    return () => {
      socket.close();
    };
  }, [refreshAutomations]);

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

  return (
    <div style={{ padding: 24, display: "grid", gap: 24 }}>
      <h1>TikTok LIVE Automation Dashboard</h1>
      <StatusBar status={status} />
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
    </div>
  );
}
