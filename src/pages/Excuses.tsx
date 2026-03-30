import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FileText, Plus, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function Excuses() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isStudent = role === "student";

  const [open, setOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState("");
  const [reason, setReason] = useState("");

  // Student: get sessions they're enrolled in
  const { data: availableSessions = [] } = useQuery({
    queryKey: ["excuse-sessions", user?.id],
    queryFn: async () => {
      const { data: enrollments } = await supabase
        .from("course_enrollments").select("course_id").eq("user_id", user!.id);
      if (!enrollments?.length) return [];
      const courseIds = enrollments.map(e => e.course_id);
      const { data } = await supabase
        .from("sessions")
        .select("id, title, session_date, courses(name, code)")
        .in("course_id", courseIds)
        .order("session_date", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: isStudent && !!user,
  });

  // Get excuses
  const { data: excuses = [], isLoading } = useQuery({
    queryKey: ["excuses", user?.id, role],
    queryFn: async () => {
      const query = supabase
        .from("excuses")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (isStudent) {
        query.eq("user_id", user!.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Get session info for excuses
  const sessionIds = [...new Set(excuses.map(e => e.session_id))];
  const { data: sessionMap = {} } = useQuery({
    queryKey: ["excuse-session-info", sessionIds],
    queryFn: async () => {
      if (!sessionIds.length) return {};
      const { data } = await supabase
        .from("sessions")
        .select("id, title, session_date, courses(name, code)")
        .in("id", sessionIds);
      return Object.fromEntries((data || []).map(s => [s.id, s]));
    },
    enabled: sessionIds.length > 0,
  });

  // Get student profiles for lecturer/admin view
  const studentIds = [...new Set(excuses.map(e => e.user_id))];
  const { data: studentMap = {} } = useQuery({
    queryKey: ["excuse-students", studentIds],
    queryFn: async () => {
      if (!studentIds.length || isStudent) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, university_id")
        .in("id", studentIds);
      return Object.fromEntries((data || []).map(p => [p.id, p]));
    },
    enabled: studentIds.length > 0 && !isStudent,
  });

  const createExcuse = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("excuses").insert({
        user_id: user!.id,
        session_id: selectedSession,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excuses"] });
      toast({ title: t("common.success"), description: t("excuse.submitted") });
      setOpen(false);
      setSelectedSession("");
      setReason("");
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const reviewExcuse = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("excuses")
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excuses"] });
      toast({ title: t("common.success") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    if (status === "rejected") return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const statusBadge = (status: string) => {
    const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
    const label = status === "approved" ? t("excuse.approved") : status === "rejected" ? t("excuse.rejected") : t("excuse.pending");
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("excuse.title")}</h1>
        {isStudent && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("excuse.request")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("excuse.request")}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); if (selectedSession && reason.trim()) createExcuse.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("excuse.selectSession")}</Label>
                  <Select value={selectedSession} onValueChange={setSelectedSession}>
                    <SelectTrigger><SelectValue placeholder={t("excuse.selectSession")} /></SelectTrigger>
                    <SelectContent>
                      {availableSessions.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title} — {(s.courses as any)?.code} ({format(new Date(s.session_date), "dd/MM/yyyy")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("excuse.reason")}</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("excuse.reasonPlaceholder")}
                    required
                    maxLength={500}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={!selectedSession || !reason.trim() || createExcuse.isPending}>
                  {createExcuse.isPending ? t("common.loading") : t("excuse.submit")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {!isLoading && excuses.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t("excuse.noExcuses")}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {excuses.map((excuse: any) => {
          const session = (sessionMap as any)[excuse.session_id];
          const student = (studentMap as any)[excuse.user_id];
          return (
            <Card key={excuse.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    {statusIcon(excuse.status)}
                    <div className="flex-1 space-y-1">
                      {!isStudent && student && (
                        <p className="text-sm font-medium">{student.full_name} <span className="text-muted-foreground text-xs">({student.university_id})</span></p>
                      )}
                      <p className="text-sm">
                        <span className="font-medium">{session?.title || "—"}</span>
                        {session?.courses && (
                          <span className="text-muted-foreground"> — {(session.courses as any).code}</span>
                        )}
                        {session?.session_date && (
                          <span className="text-muted-foreground text-xs ml-2">
                            ({format(new Date(session.session_date), "dd/MM/yyyy")})
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{excuse.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(excuse.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(excuse.status)}
                    {!isStudent && excuse.status === "pending" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => reviewExcuse.mutate({ id: excuse.id, status: "approved" })}
                          disabled={reviewExcuse.isPending}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />{t("excuse.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => reviewExcuse.mutate({ id: excuse.id, status: "rejected" })}
                          disabled={reviewExcuse.isPending}
                        >
                          <XCircle className="h-3 w-3 mr-1" />{t("excuse.reject")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
