import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, ShieldAlert } from "lucide-react";

type AuditRow = {
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

export default function AdminAuditLog() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return ((data || []) as unknown) as AuditRow[];
    },
  });

  const actorIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[])),
    [rows]
  );

  const { data: actors = {} } = useQuery({
    queryKey: ["audit-actors", actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, university_id, email")
        .in("id", actorIds);
      return Object.fromEntries((data || []).map((p: any) => [p.id, p]));
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (entity !== "all" && r.entity_type !== entity) return false;
      if (action !== "all" && r.action !== action) return false;
      if (from && r.created_at < from) return false;
      if (to && r.created_at > to + "T23:59:59") return false;
      if (search) {
        const a: any = (actors as any)[r.actor_id || ""] || {};
        const hay = `${r.entity_type} ${r.entity_id} ${a.full_name || ""} ${a.university_id || ""} ${a.email || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, entity, action, from, to, search, actors]);

  const entities = useMemo(() => Array.from(new Set(rows.map((r) => r.entity_type))).sort(), [rows]);

  const exportCsv = () => {
    const header = ["timestamp", "actor", "actor_role", "action", "entity_type", "entity_id", "old_data", "new_data"];
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = filtered.map((r) => {
      const a: any = (actors as any)[r.actor_id || ""] || {};
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
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk'] flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" /> System Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">Track every action performed by every user.</p>
        </div>
        <Button onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-5">
          <Input placeholder="Search actor / entity…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="all">All entities</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">All actions</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Events ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <p className="p-4 text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-muted-foreground">No audit events found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Actor</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Action</th>
                  <th className="text-left p-3">Entity</th>
                  <th className="text-left p-3">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const a: any = (actors as any)[r.actor_id || ""] || {};
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="p-3">{a.full_name || r.actor_id || <span className="text-muted-foreground">system</span>}</td>
                      <td className="p-3"><Badge variant="outline" className="text-[10px]">{r.actor_role || "—"}</Badge></td>
                      <td className="p-3">
                        <Badge variant={r.action === "DELETE" ? "destructive" : r.action === "INSERT" ? "default" : "secondary"} className="text-[10px]">
                          {r.action}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs">{r.entity_type}</td>
                      <td className="p-3 font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">{r.entity_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}