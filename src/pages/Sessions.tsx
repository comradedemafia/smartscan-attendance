import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Sessions() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");

  const canManage = role === "lecturer" || role === "admin";

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, code, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, courses(code, name)")
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").insert({
        title,
        course_id: courseId,
        venue_name: venueName || null,
        duration_minutes: parseInt(durationMinutes),
        created_by: user!.id,
        status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: t("common.success"), description: "Session created" });
      setOpen(false);
      setTitle("");
      setCourseId("");
      setVenueName("");
      setDurationMinutes("30");
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !courseId) return;
    createMutation.mutate();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "completed": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("sessions.title")}</h1>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />{t("sessions.create")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("sessions.create")}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 1 Lecture" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("sessions.course")}</Label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                    <SelectContent>
                      {courses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("sessions.venue")}</Label>
                  <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Room 101" />
                </div>
                <div className="space-y-2">
                  <Label>{t("sessions.duration")}</Label>
                  <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 {t("qr.minutes")}</SelectItem>
                      <SelectItem value="30">30 {t("qr.minutes")}</SelectItem>
                      <SelectItem value="45">45 {t("qr.minutes")}</SelectItem>
                      <SelectItem value="60">60 {t("qr.minutes")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {t("sessions.create")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t("dashboard.noSessions")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session: any) => (
            <Card key={session.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{(session.courses as any)?.code}</p>
                    <CardTitle className="text-base mt-1">{session.title}</CardTitle>
                  </div>
                  <Badge variant={statusColor(session.status) as any}>{session.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{session.session_date}</span>
                  {session.venue_name && <span>📍 {session.venue_name}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{session.duration_minutes} {t("qr.minutes")}</p>
                {canManage && session.created_by === user?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => navigate(`/sessions/${session.id}/qr`)}
                  >
                    <QrCode className="h-4 w-4 mr-2" />
                    {t("sessions.generateQr")}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
