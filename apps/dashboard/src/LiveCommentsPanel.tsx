import { useState } from "react";
import { TTS_LANGUAGES } from "@tiktok-live/shared-types";
import { api } from "./api-client.js";

export interface DisplayedComment {
  id: string;
  nickname: string;
  username: string;
  text: string;
  receivedAt: number;
}

interface Props {
  comments: DisplayedComment[];
}

const LANG_LABEL: Record<string, string> = Object.fromEntries(TTS_LANGUAGES.map((l) => [l.code, l.label]));

/**
 * Bình luận trực tiếp lúc live — yêu cầu người dùng: streamer TỰ CHỌN từng bình
 * luận cụ thể (không tự động cho mọi comment) để: (1) dịch sang tiếng Việt + đọc,
 * (2) gõ trả lời tiếng Việt, dịch sang ngôn ngữ người đó + đọc lại bằng giọng đúng
 * ngôn ngữ. Chỉ giữ N bình luận gần nhất trong bộ nhớ trình duyệt (App.tsx).
 */
export function LiveCommentsPanel({ comments }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translated, setTranslated] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(false);

  async function handleTranslateRead(comment: DisplayedComment) {
    setError(null);
    setBusyId(comment.id);
    try {
      const result = await api.translateComment(comment.text, comment.nickname);
      setSelectedId(comment.id);
      setDetectedLang(result.detectedSourceLang);
      setTranslated(result.translatedText);
      setReplyText("");
      setReplySent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dịch bình luận thất bại");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendReply() {
    if (!detectedLang || replyText.trim().length === 0) return;
    setError(null);
    setBusyId("__reply__");
    try {
      await api.replyComment(replyText.trim(), detectedLang);
      setReplySent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi trả lời thất bại");
    } finally {
      setBusyId(null);
    }
  }

  if (comments.length === 0) {
    return (
      <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-text-muted">
        Chưa có bình luận nào — chờ khán giả comment lúc đang live.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {comments.map((c) => {
          const expanded = selectedId === c.id;
          return (
            <li key={c.id} className="rounded-xl bg-surface-2 px-3.5 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.nickname}</p>
                  <p className="break-words text-sm text-text-muted">{c.text}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary shrink-0 !px-2.5 !py-1.5 text-xs"
                  onClick={() => handleTranslateRead(c)}
                  disabled={busyId === c.id}
                >
                  {busyId === c.id ? "…" : "🌐 Đọc & dịch"}
                </button>
              </div>

              {expanded && translated && (
                <div className="mt-2 space-y-2 border-t border-border pt-2">
                  <p className="text-xs text-text-muted">
                    Đã dịch ({LANG_LABEL[detectedLang ?? ""] ?? detectedLang} → Tiếng Việt):{" "}
                    <span className="text-text">{translated}</span>
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Gõ trả lời bằng tiếng Việt..."
                      className="text-sm"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 text-sm"
                      onClick={handleSendReply}
                      disabled={busyId === "__reply__" || replyText.trim().length === 0}
                    >
                      {busyId === "__reply__" ? "…" : replySent ? "Đã gửi ✓" : "Gửi & đọc"}
                    </button>
                  </div>
                  <p className="text-xs text-text-muted">
                    Trả lời sẽ được dịch sang {LANG_LABEL[detectedLang ?? ""] ?? detectedLang} và đọc bằng giọng
                    tương ứng.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
