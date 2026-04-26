import type { AdminDataRow, LeadBehavior, WarmLeadForm } from "./types";

const base = () => (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export async function fetchAdminDataList(): Promise<AdminDataRow[]> {
  const r = await fetch(`${base()}/api/admin-data`, {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`admin-data: ${r.status}`);
  return r.json();
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
