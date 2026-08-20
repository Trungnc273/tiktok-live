import type { AutomationRule } from "@tiktok-live/shared-types";

export type CreateAutomationInput = Omit<AutomationRule, "id" | "createdAt" | "updatedAt">;

export interface StatusResponse {
  connectionState: string;
  viewerCount: number | null;
  counts: Record<string, number>;
  /** Username TikTok THẬT đang được theo dõi — có thể khác username đã lưu ở ô input nếu chưa bấm lại "Bắt đầu theo dõi". */
  activeTikTokUsername?: string | null;
}

export interface RecentEvent {
  id: string;
  type: string;
  username: string | null;
  payload: unknown;
  receivedAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: "admin" | "user";
  tiktokUsername: string | null;
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: "admin" | "user";
  tiktokUsername: string | null;
  disabledAt: string | null;
  createdAt: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // --- Auth ---
  register: (email: string, password: string) =>
    fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => json<CurrentUser>(r)),

  login: (email: string, password: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => json<CurrentUser>(r)),

  logout: () => fetch("/api/auth/logout", { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),

  me: async (): Promise<CurrentUser | null> => {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) return null;
    return json<CurrentUser | null>(res);
  },

  setTiktokUsername: (tiktokUsername: string | null) =>
    fetch("/api/auth/tiktok-username", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tiktokUsername }),
    }).then((r) => json<{ ok: boolean }>(r)),

  // --- Live monitoring ---
  startLive: () => fetch("/api/live/start", { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),
  stopLive: () => fetch("/api/live/stop", { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),

  // --- Overlay ---
  createOverlayUrl: () => fetch("/api/overlays", { method: "POST" }).then((r) => json<{ token: string; url: string }>(r)),

  // --- Admin ---
  listUsers: () => fetch("/api/admin/users").then((r) => json<AdminUserRow[]>(r)),
  disableUser: (id: string) => fetch(`/api/admin/users/${id}/disable`, { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),
  enableUser: (id: string) => fetch(`/api/admin/users/${id}/enable`, { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),

  // --- Automations ---
  listAutomations: () => fetch("/api/automations").then((r) => json<AutomationRule[]>(r)),

  createAutomation: (input: CreateAutomationInput) =>
    fetch("/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<AutomationRule>(r)),

  updateAutomation: (id: string, input: Partial<CreateAutomationInput>) =>
    fetch(`/api/automations/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<AutomationRule>(r)),

  deleteAutomation: (id: string) => fetch(`/api/automations/${id}`, { method: "DELETE" }).then((r) => json<void>(r)),

  duplicateAutomation: (id: string) =>
    fetch(`/api/automations/${id}/duplicate`, { method: "POST" }).then((r) => json<AutomationRule>(r)),

  // --- Nghe thử TTS trước khi lưu automation ---
  previewTts: (text: string, lang?: string) =>
    fetch("/api/tts/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang }),
    }).then((r) => json<{ url: string }>(r)),

  // --- Thư viện sound (có sẵn hệ thống + upload) ---
  listSounds: () =>
    fetch("/api/sounds").then((r) => json<{ builtin: { file: string; label: string }[]; uploaded: string[] }>(r)),

  uploadSound: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/sounds/upload", { method: "POST", body: form });
    return json<{ file: string }>(res);
  },

  getStatus: () => fetch("/api/status").then((r) => json<StatusResponse>(r)),

  getRecentEvents: (limit = 20) => fetch(`/api/events/recent?limit=${limit}`).then((r) => json<RecentEvent[]>(r)),
};
