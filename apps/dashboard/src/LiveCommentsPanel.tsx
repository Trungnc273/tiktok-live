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
 *
 * "Khoá" danh sách khi bấm đọc & dịch (yêu cầu người dùng: live đông bình luận
 * nhảy liên tục, bấm không kịp) — CHỤP LẠI nguyên trạng danh sách đang hiện tại
 * thời điểm bấm (giữ nguyên mọi bình luận đã thấy, không ẩn đi cái nào), bình
 * luận mới phát sinh SAU đó bị giữ lại chưa hiện, chỉ hiện nút "↓ N bình luận
 * mới" để chủ động bấm mới nhảy tới, không tự nhảy làm mất focus giữa chừng.
 */
export function LiveCommentsPanel({ comments }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translated, setTranslated] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replySent, setReplySent] = useState(false);
  // Ảnh chụp nguyên mảng comments tại thời điểm khoá — KHÔNG dùng index sống
  // trên `comments` (sẽ làm ẩn mất bình luận đã thấy trước đó khi có tin mới đổ về).
  const [pausedSnapshot, setPausedSnapshot] = useState<DisplayedComment[] | null>(null);

  const isPaused = pausedSnapshot !== null;
  const visibleComments = isPaused ? pausedSnapshot : comments;
  // Đếm số bình luận THẬT SỰ MỚI (phát sinh sau lúc khoá) bằng cách tìm vị trí
  // của bình luận mới nhất trong snapshot trên mảng `comments` sống hiện tại.
  const newestPausedId = pausedSnapshot?.[0]?.id;
  const newestPausedIndex = newestPausedId ? comments.findIndex((c) => c.id === newestPausedId) : -1;
  const newCount = newestPausedIndex >= 0 ? newestPausedIndex : 0;

  async function handleTranslateRead(comment: DisplayedComment) {
    setError(null);
    setBusyId(comment.id);
    setPausedSnapshot((prev) => prev ?? comments); // chỉ chụp nếu CHƯA khoá — giữ nguyên khung hình cũ nếu bấm tiếp 1 bình luận khác trong lúc đang khoá
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
      {isPaused && (
        <button
          type="button"
          className="btn btn-primary sticky top-0 z-10 w-full text-sm"
          onClick={() => setPausedSnapshot(null)}
        >
          {newCount > 0 ? `↓ ${newCount} bình luận mới — bấm để xem tiếp` : "↓ Tiếp tục xem bình luận mới"}
        </button>
      )}

      <ul className="space-y-2">
        {visibleComments.map((c) => {
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
