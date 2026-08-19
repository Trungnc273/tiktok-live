import type { AutomationRule } from "@tiktok-live/shared-types";

export type CreateAutomationInput = Omit<AutomationRule, "id" | "createdAt" | "updatedAt">;

export interface StatusResponse {
  connectionState: string;
  viewerCount: number | null;
  counts: Record<string, number>;
}

export interface RecentEvent {
  id: string;
  type: string;
  username: string | null;
  payload: unknown;
  receivedAt: string;
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

  getStatus: () => fetch("/api/status").then((r) => json<StatusResponse>(r)),

  getRecentEvents: (limit = 20) => fetch(`/api/events/recent?limit=${limit}`).then((r) => json<RecentEvent[]>(r)),
};
