import type { AdminDataRow, LeadBehavior, WarmLeadForm } from "./types";

const base = () => (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Базовый URL API без завершающего слэша (пустая строка = тот же хост, что у страницы). */
export function apiBase(): string {
  return base();
}

export const ADMIN_TOKEN_KEY = "autello_admin_token";

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function readHttpError(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail) && j.detail[0] && typeof j.detail[0] === "object") {
      const row = j.detail[0] as { msg?: string };
      if (row.msg) return row.msg;
    }
  } catch {
    /* plain */
  }
  return t || `HTTP ${r.status}`;
}

export type RegistrationOpen = { open: boolean };

export async function fetchRegistrationOpen(): Promise<RegistrationOpen> {
  const r = await fetch(`${base()}/api/admin-auth/registration-open`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<RegistrationOpen>;
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ access_token: string; token_type?: string }> {
  const r = await fetch(`${base()}/api/admin-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<{ access_token: string; token_type?: string }>;
}

export async function registerAdmin(
  username: string,
  password: string
): Promise<{ access_token: string; token_type?: string }> {
  const r = await fetch(`${base()}/api/admin-auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<{ access_token: string; token_type?: string }>;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("401");
    this.name = "UnauthorizedError";
  }
}

export async function fetchAdminMe(
  token: string
): Promise<{ id: number; username: string }> {
  const r = await fetch(`${base()}/api/admin-auth/me`, {
    headers: authHeaders(token),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<{ id: number; username: string }>;
}

export type AdminDataWritePayload = {
  services: AdminDataRow["services"];
  budget_range_min: string | null;
  budget_range_max: string | null;
  extra_ui: Record<string, unknown> | null;
};

export async function fetchAdminDataList(): Promise<AdminDataRow[]> {
  const r = await fetch(`${base()}/api/admin-data`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`admin-data: ${r.status}`);
  return r.json() as Promise<AdminDataRow[]>;
}

export async function patchAdminData(
  token: string,
  id: number,
  body: Partial<AdminDataWritePayload>
): Promise<AdminDataRow> {
  const r = await fetch(`${base()}/api/admin-data/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<AdminDataRow>;
}

export async function createAdminData(
  token: string,
  body: AdminDataWritePayload
): Promise<AdminDataRow> {
  const r = await fetch(`${base()}/api/admin-data`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<AdminDataRow>;
}

export type AdminUserRow = {
  id: number;
  username: string;
  created_at: string;
  updated_at: string | null;
};

export async function fetchAdminUsers(token: string): Promise<AdminUserRow[]> {
  const r = await fetch(`${base()}/api/admin-users`, { headers: authHeaders(token) });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<AdminUserRow[]>;
}

export async function createAdminUser(
  token: string,
  body: { username: string; password: string }
): Promise<AdminUserRow> {
  const r = await fetch(`${base()}/api/admin-users`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<AdminUserRow>;
}

export async function patchAdminUser(
  token: string,
  id: number,
  body: { username?: string; password?: string }
): Promise<AdminUserRow> {
  const r = await fetch(`${base()}/api/admin-users/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<AdminUserRow>;
}

export async function deleteAdminUser(token: string, id: number): Promise<void> {
  const r = await fetch(`${base()}/api/admin-users/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
}

export type WarmLeadCreatePayload = WarmLeadForm & { behavior: LeadBehavior | null };

export async function submitWarmLead(
  body: WarmLeadCreatePayload
): Promise<unknown> {
  const r = await fetch(`${base()}/api/warm-leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
}

/** Периодическая телеметрия лендинга → POST /api/lead-behavior */
export type LeadBehaviorPingPayload = {
  application_id: number;
  time_on_page: number;
  buttons_clicked: string;
  cursor_positions: string;
  return_frequency: number;
};

export type LeadBehaviorPingRow = {
  id: number;
  application_id: number;
  time_on_page: number;
  buttons_clicked: string;
  cursor_positions: string;
  return_frequency: number;
  created_at: string;
};

export async function fetchLeadBehaviorPings(
  token: string,
  params: { skip?: number; limit?: number } = {}
): Promise<LeadBehaviorPingRow[]> {
  const skip = params.skip ?? 0;
  const limit = params.limit ?? 100;
  const q = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  const r = await fetch(`${base()}/api/lead-behavior/records?${q}`, {
    headers: authHeaders(token),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<LeadBehaviorPingRow[]>;
}

export function postLeadBehaviorPing(body: LeadBehaviorPingPayload): void {
  const url = `${base()}/api/lead-behavior`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  })
    .then(async (r) => {
      if (r.ok) return;
      let detail = "";
      try {
        detail = (await r.text()).slice(0, 400);
      } catch {
        /* ignore */
      }
      console.warn(
        "[autello] POST /api/lead-behavior failed",
        r.status,
        detail || r.statusText
      );
    })
    .catch((err) => {
      console.warn("[autello] POST /api/lead-behavior network error", err);
    });
}

/** Одна тестовая строка телеметрии (без JWT). Для проверки, что бэкенд и таблица `lead_behavior_pings` доступны. */
export async function sendTestLeadBehaviorPing(): Promise<{
  ok: boolean;
  status: number;
  detail: string;
}> {
  const url = `${base()}/api/lead-behavior`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      application_id: 0,
      time_on_page: 1,
      buttons_clicked: JSON.stringify({ admin_test: 1 }),
      cursor_positions: JSON.stringify([{ x: 400, y: 300, t: 0 }]),
      return_frequency: 0,
    }),
  });
  const detail = (await r.text()).slice(0, 800);
  return { ok: r.ok, status: r.status, detail };
}

export function parseBudgetBounds(
  min: string | null | undefined,
  max: string | null | undefined
): { min: number; max: number } {
  const a = min != null && min !== "" ? Number(String(min).replace(/\s/g, "")) : NaN;
  const b = max != null && max !== "" ? Number(String(max).replace(/\s/g, "")) : NaN;
  const minN = Number.isFinite(a) ? a : 0;
  const maxN = Number.isFinite(b) ? b : 1_000_000;
  return minN <= maxN ? { min: minN, max: maxN } : { min: 0, max: 1_000_000 };
}

/** Скоринг тёплого лида: ответ /api/admin/warm-leads (JWT) */
export type LeadScoreDetails = {
  budget: number;
  company: number;
  role: number;
  deadline: number;
  niche: number;
  need: number;
};

export type ScoredWarmLead = {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  business_info: string | null;
  business_niche: string | null;
  company_size: string | null;
  task_volume: string | null;
  role_type: string | null;
  business_size: string | null;
  need_volume: string | null;
  result_deadline: string | null;
  task_type: string | null;
  product_interest: string | null;
  budget: string | null;
  contact_method: string | null;
  preferred_time: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string | null;
  priority_score: number;
  temperature: "hot" | "warm" | "cold";
  temperature_label: string;
  department: "vip" | "general";
  department_label: string;
  attention_label: string;
  personal_manager_recommended: boolean;
  score_details: LeadScoreDetails;
  budget_parsed_rub: number;
};

export type AdminWarmLeadsListResponse = {
  stats: { total: number; hot: number; warm: number; cold: number };
  items: ScoredWarmLead[];
};

export async function fetchAdminWarmLeads(
  token: string,
  params: {
    sort?: "priority" | "created_desc";
    skip?: number;
    limit?: number;
  } = {}
): Promise<AdminWarmLeadsListResponse> {
  const q = new URLSearchParams();
  q.set("sort", params.sort ?? "priority");
  q.set("skip", String(params.skip ?? 0));
  q.set("limit", String(params.limit ?? 200));
  const r = await fetch(`${base()}/api/admin/warm-leads?${q}`, {
    headers: authHeaders(token),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<AdminWarmLeadsListResponse>;
}

export async function fetchAdminWarmLeadById(
  token: string,
  id: number
): Promise<ScoredWarmLead> {
  const r = await fetch(`${base()}/api/admin/warm-leads/${id}`, {
    headers: authHeaders(token),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json() as Promise<ScoredWarmLead>;
}
