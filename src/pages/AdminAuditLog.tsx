import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { computeDiff, filterAuditRows, type AuditRow as AuditRowT } from "@/lib/auditLog";
import { useI18n } from "@/lib/i18n";

type AuditRow = AuditRowT;

const PAGE_SIZE = 25;

export default function AdminAuditLog() {
  const { t, dateLocale } = useI18n();
  const actionLabel = (value: string) => value === "INSERT" ? t("audit.actionInsert") : value === "UPDATE" ? t("audit.actionUpdate") : value === "DELETE" ? t("audit.actionDelete") : value;
  const roleLabel = (value?: string | null) => value === "admin" ? t("common.admin") : value === "lecturer" ? t("auth.lecturer") : value === "student" ? t("auth.student") : value || "—";
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    return filterAuditRows(rows, { entity, action, from, to, search }, actors as any);
  }, [rows, entity, action, from, to, search, actors]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk'] flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" /> {t("audit.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
        </div>
        <Button onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" /> {t("audit.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-3 md:grid-cols-5">
          <Input placeholder={t("audit.searchPlaceholder")} value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} />
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={entity} onChange={(e) => resetPage(setEntity)(e.target.value)}>
            <option value="all">{t("common.allEntities")}</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={action} onChange={(e) => resetPage(setAction)(e.target.value)}>
            <option value="all">{t("common.allActions")}</option>
            <option value="INSERT">{t("audit.actionInsert")}</option>
            <option value="UPDATE">{t("audit.actionUpdate")}</option>
            <option value="DELETE">{t("audit.actionDelete")}</option>
          </select>
          <Input type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("audit.events")} ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <p className="p-4 text-muted-foreground">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-muted-foreground">{t("audit.noEvents")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="w-8 p-3"></th>
                  <th className="text-left p-3">{t("common.when")}</th>
                  <th className="text-left p-3">{t("common.actor")}</th>
                  <th className="text-left p-3">{t("common.role")}</th>
                  <th className="text-left p-3">{t("common.action")}</th>
                  <th className="text-left p-3">{t("common.entity")}</th>
                  <th className="text-left p-3">{t("common.entityId")}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const a: any = (actors as any)[r.actor_id || ""] || {};
                  const isOpen = !!expanded[r.id];
                  const diff = computeDiff(r.old_data, r.new_data);
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}>
                        <td className="p-3">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="p-3 whitespace-nowrap">{format(new Date(r.created_at), "PPpp", { locale: dateLocale })}</td>
                        <td className="p-3">{a.full_name || r.actor_id || <span className="text-muted-foreground">{t("common.system")}</span>}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px]">{roleLabel(r.actor_role)}</Badge></td>
                        <td className="p-3">
                          <Badge variant={r.action === "DELETE" ? "destructive" : r.action === "INSERT" ? "default" : "secondary"} className="text-[10px]">
                            {actionLabel(r.action)}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs">{r.entity_type}</td>
                        <td className="p-3 font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">{r.entity_id}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/20 border-t">
                          <td></td>
                          <td colSpan={6} className="p-3">
                            {diff.length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t("audit.noFieldChanges")}</p>
                            ) : (
                              <table className="w-full text-xs border rounded-md overflow-hidden">
                                <thead className="bg-muted/40">
                                  <tr>
                                    <th className="text-left p-2">{t("common.field")}</th>
                                    <th className="text-left p-2">{t("common.old")}</th>
                                    <th className="text-left p-2">{t("common.new")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {diff.map((d) => (
                                    <tr key={d.key} className="border-t">
                                      <td className="p-2 font-mono">{d.key}</td>
                                      <td className="p-2 font-mono text-destructive break-all">{d.oldVal}</td>
                                      <td className="p-2 font-mono text-primary break-all">{d.newVal}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between p-3 border-t text-sm">
              <span className="text-muted-foreground">
                {t("audit.page")} {currentPage} {t("audit.of")} {totalPages} • {filtered.length} {t("audit.eventsCount")}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t("common.prev")}</Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>{t("common.next")}</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}