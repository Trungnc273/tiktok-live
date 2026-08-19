import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { LiveEvent, OverlayMessage } from "@tiktok-live/shared-types";
import { Alert } from "./Alert.js";
import { describeAlert, type AlertContent } from "./alert-renderer.js";
import { SequenceGuard } from "./sequence-guard.js";

const ALERT_LIFETIME_MS = 6000;

interface DisplayedAlert extends AlertContent {
  id: string;
}

function getTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

export function App() {
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<DisplayedAlert[]>([]);
  const guardRef = useRef(new SequenceGuard());

  useEffect(() => {
    const token = getTokenFromUrl();
    const socket: Socket = io(`${window.location.origin}/overlay`, {
      path: "/socket.io",
      query: { token: token ?? "" },
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("message", (message: OverlayMessage) => {
      if (!guardRef.current.accept(message.sequence)) return; // duplicate/cũ hơn -> bỏ qua
      if (message.type !== "liveEvent") return; // sound/tts ready xử lý ở milestone sau

      const content = describeAlert(message.data as LiveEvent);
      if (!content) return;

      const id = `${message.sequence}-${Date.now()}`;
      setAlerts((prev) => [...prev, { ...content, id }]);
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }, ALERT_LIFETIME_MS);
    });

    return () => {
      socket.close();
    };
  }, []);

  return (
    <div>
      {!connected && (
        <div style={{ position: "fixed", top: 8, left: 8, color: "#f66", fontSize: 12 }}>
          Mất kết nối overlay — đang thử kết nối lại...
        </div>
      )}
      <div style={{ position: "fixed", bottom: 16, left: 16 }}>
        {alerts.map((a) => (
          <Alert key={a.id} content={a} />
        ))}
      </div>
    </div>
  );
}
