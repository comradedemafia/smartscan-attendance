export type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
};

export type AuditFilters = {
  entity: string;
  action: string;
  from: string;
  to: string;
  search: string;
};

export type ActorMap = Record<string, { full_name?: string; university_id?: string; email?: string }>;

export function filterAuditRows(rows: AuditRow[], f: AuditFilters, actors: ActorMap = {}): AuditRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.entity !== "all" && r.entity_type !== f.entity) return false;
    if (f.action !== "all" && r.action !== f.action) return false;
    if (f.from && r.created_at < f.from) return false;
    if (f.to && r.created_at > f.to + "T23:59:59") return false;
    if (q) {
      const a = actors[r.actor_id || ""] || {};
      const hay = `${r.entity_type} ${r.entity_id || ""} ${a.full_name || ""} ${a.university_id || ""} ${a.email || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type DiffEntry = { key: string; oldVal: string; newVal: string };

const stringify = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

const SKIP_KEYS = new Set(["updated_at"]);

export function computeDiff(oldData: any, newData: any): DiffEntry[] {
  const o = oldData || {};
  const n = newData || {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).sort();
  const result: DiffEntry[] = [];
  for (const k of keys) {
    if (SKIP_KEYS.has(k)) continue;
    const ov = stringify(o[k]);
    const nv = stringify(n[k]);
    if (ov !== nv) result.push({ key: k, oldVal: ov, newVal: nv });
  }
  return result;
}

export function buildAuditCsv(rows: AuditRow[], actors: ActorMap = {}): string {
  const header = ["timestamp", "actor", "actor_role", "action", "entity_type", "entity_id", "old_data", "new_data"];
  const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => {
    const a = actors[r.actor_id || ""] || {};
    const actor = a.full_name ? `${a.full_name} (${a.university_id || a.email || r.actor_id})` : r.actor_id || "system";
    return [
      r.created_at,
      actor,
      r.actor_role || "",
      r.action,
      r.entity_type,
      r.entity_id || "",
      r.old_data ? JSON.stringify(r.old_data) : "",
      r.new_data ? JSON.stringify(r.new_data) : "",
    ].map(escape).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}