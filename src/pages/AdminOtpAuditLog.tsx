import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ShieldCheck, ShieldAlert, Filter, Eraser } from "lucide-react";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZE = 25;
type SuccessFilter = "all" | "success" | "failure";
type SortDir = "newest" | "oldest";

export default function AdminOtpAuditLog() {
  const { role } = useAuth();
  const { t } = useI18n();
  const [userId, setUserId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>("all");
  const [sortDir, setSortDir] = useState<SortDir>("newest");
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const isAdmin = role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["otp-audit-log", userId, sessionId, successFilter, sortDir, page, fromDate, toDate],
    enabled: isAdmin,
    queryFn: async () => {
      let query = supabase
        .from("otp_verification_log")
        .select(
          "id, user_id, session_id, success, matched_offset, failure_reason, ip_address, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: sortDir === "oldest" })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (userId.trim()) query = query.eq("user_id", userId.trim());
      if (sessionId.trim()) query = query.eq("session_id", sessionId.trim());
      if (successFilter !== "all") {
        query = query.eq("success", successFilter === "success");
      }
      if (fromDate) query = query.gte("created_at", new Date(fromDate).toISOString());
      if (toDate) {
        // Inclusive end of day
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], total: count || 0 };
    },
  });

  const totalPages = useMemo(() => {
    if (!data?.total) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data?.total]);

  const clearFilters = () => {
    setUserId("");
    setSessionId("");
    setSuccessFilter("all");
    setSortDir("newest");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Admins only.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
          {t("otpAudit.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("otpAudit.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {t("otpAudit.filters")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("otpAudit.userIdLabel")}
            </label>
            <Input
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              placeholder="uuid…"
              className="h-9 text-xs font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("otpAudit.sessionIdLabel")}
            </label>
            <Input
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setPage(1);
              }}
              placeholder="uuid…"
              className="h-9 text-xs font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("otpAudit.successLabel")}
            </label>
            <Select
              value={successFilter}
              onValueChange={(v: SuccessFilter) => {
                setSuccessFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("otpAudit.allResults")}</SelectItem>
                <SelectItem value="success">{t("otpAudit.successOnly")}</SelectItem>
                <SelectItem value="failure">{t("otpAudit.failureOnly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("otpAudit.sortBy")}
            </label>
            <Select
              value={sortDir}
              onValueChange={(v: SortDir) => { setSortDir(v); setPage(1); }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t("otpAudit.sortNewest")}</SelectItem>
                <SelectItem value="oldest">{t("otpAudit.sortOldest")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-9"
              onClick={clearFilters}
            >
              <Eraser className="h-3.5 w-3.5 mr-1.5" />
              {t("otpAudit.clear")}
            </Button>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("otpAudit.when")}</TableHead>
                  <TableHead>{t("otpAudit.result")}</TableHead>
                  <TableHead>{t("otpAudit.user")}</TableHead>
                  <TableHead>{t("otpAudit.session")}</TableHead>
                  <TableHead>{t("otpAudit.reason")}</TableHead>
                  <TableHead className="text-right">{t("otpAudit.offset")}</TableHead>
                  <TableHead>{t("otpAudit.ip")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      …
                    </TableCell>
                  </TableRow>
                ) : (data?.rows.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      {t("otpAudit.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        {row.success ? (
                          <Badge variant="default" className="gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            {t("otpAudit.success")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldAlert className="h-3 w-3" />
                            {t("otpAudit.failure")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {row.user_id?.slice(0, 8) ?? "—"}…
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">
                        {row.session_id ? `${row.session_id.slice(0, 8)}…` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.failure_reason ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted">
                                {row.failure_reason.length > 24
                                  ? row.failure_reason.slice(0, 24) + "…"
                                  : row.failure_reason}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs break-all">
                              {row.failure_reason}
                            </TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row.matched_offset ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {row.ip_address ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted">
                                {row.ip_address.length > 16
                                  ? row.ip_address.slice(0, 16) + "…"
                                  : row.ip_address}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs break-all">
                              {row.ip_address}
                            </TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {t("otpAudit.page")} {page} {t("otpAudit.of")} {totalPages}
          {data?.total ? ` • ${data.total}` : ""}
        </div>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 1) setPage((p) => p - 1);
                }}
                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink isActive>{page}</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={(e) => {
                  e.preventDefault();
                  if (page < totalPages) setPage((p) => p + 1);
                }}
                className={
                  page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
