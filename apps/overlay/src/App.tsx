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

// Lấy constructor AudioContext có tiền tố webkit trên trình duyệt cũ/WebView
// trong-app (vd trình duyệt nhúng của app TikTok) — không có type chuẩn cho
// "webkitAudioContext" nên khai báo tối thiểu ở đây.
function getAudioContextCtor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function App() {
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<DisplayedAlert[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const guardRef = useRef(new SequenceGuard());
  // Mọi tiếng đọc/âm thanh (TTS + sound) đi qua CHUNG 1 hàng đợi, phát tuần
  // tự từng cái một — trước đây mỗi tiếng được phát ngay lập tức nên gift
  // dồn dập sẽ tạo nhiều audio chạy song song, đè tiếng lên nhau.
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  // Effect đăng ký socket listener chỉ chạy 1 lần (deps rỗng) nên không thấy
  // được state audioUnlocked mới nhất qua closure -> phải đọc qua ref.
  const audioUnlockedRef = useRef(false);
  // Dùng CHUNG 1 AudioContext cho cả phiên, resume() 1 lần trong lúc chạm (đúng
  // user-gesture) — sau đó MỌI audio phát qua context này (kể cả tạo bằng
  // <audio>/AudioBufferSourceNode mới sau này) không cần gesture nữa.
  //
  // Trước đây dùng thẻ <audio> riêng cho mỗi lần "mở khoá" bằng 1 file WAV câm:
  // trên nhiều trình duyệt di động — đặc biệt trình duyệt nhúng TRONG APP TikTok
  // (rất nghiêm ngặt, khác Safari/Chrome thường) — việc "mở khoá" 1 thẻ <audio>
  // KHÔNG áp dụng cho các thẻ <audio> khác tạo sau đó, nên TTS vẫn bị chặn âm
  // thầm dù đã bấm nút — bug thật user gặp khi test trên điện thoại. AudioContext
  // dùng chung giải quyết đúng gốc vấn đề này (chuẩn "unlock" cho iOS/WebView).
  const audioCtxRef = useRef<AudioContext | null>(null);

  async function playNext(): Promise<void> {
    if (!audioUnlockedRef.current) return; // đợi unlock, hàng đợi vẫn giữ nguyên
    const url = audioQueueRef.current.shift();
    if (!url) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;

    const ctx = audioCtxRef.current;
    try {
      if (!ctx) throw new Error("AudioContext chưa sẵn sàng");
      if (ctx.state === "suspended") await ctx.resume();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Tải audio thất bại: HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        void playNext();
      };
      source.start(0);
    } catch {
      // Tải/giải mã lỗi (mạng chậm, file hỏng...) -> đừng kẹt hàng đợi, phát
      // tiếp cái sau thay vì im lặng dừng hẳn cả overlay.
      void playNext();
    }
  }

  function enqueueAudio(url: string) {
    audioQueueRef.current.push(url);
    if (!isPlayingRef.current) void playNext();
  }

  function unlockAudio() {
    setUnlockError(null);
    try {
      const Ctor = getAudioContextCtor();
      if (!Ctor) throw new Error("Trình duyệt này không hỗ trợ Web Audio API");
      if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
      audioCtxRef.current
        .resume()
        .then(() => {
          audioUnlockedRef.current = true;
          setAudioUnlocked(true);
          if (!isPlayingRef.current) void playNext(); // phát bù các tiếng đã xếp hàng trước khi unlock
        })
        .catch((err: unknown) => {
          setUnlockError(err instanceof Error ? err.message : "Không bật được âm thanh");
        });
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Không bật được âm thanh");
    }
  }

  useEffect(() => {
    const token = getTokenFromUrl();
    const socket: Socket = io(`${window.location.origin}/overlay`, {
      path: "/socket.io",
      query: { token: token ?? "" },
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    // Resync khi (re)connect — docs/architecture/REALTIME-ARCHITECTURE.md.
    socket.on("sync", (payload: { sequence: number }) => {
      guardRef.current.fastForwardTo(payload.sequence);
    });

    socket.on("message", (message: OverlayMessage) => {
      if (!guardRef.current.accept(message.sequence)) return; // duplicate/cũ hơn -> bỏ qua

      if (message.type === "soundReady" || message.type === "ttsReady") {
        const { url } = message.data as { url: string };
        enqueueAudio(url);
        return;
      }

      if (message.type !== "liveEvent") return;

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
      {!audioUnlocked && (
        <button
          type="button"
          onClick={unlockAudio}
          data-testid="unlock-audio-button"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            width: "100%",
            height: "100%",
            border: "none",
            background: "rgba(0,0,0,0.75)",
            color: "white",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🔊 Chạm để bật âm thanh
          {unlockError && (
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 400, color: "#f88" }}>
              Lỗi: {unlockError} — thử chạm lại
            </div>
          )}
        </button>
      )}
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
