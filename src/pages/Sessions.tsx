import { useState, useMemo } from "react";
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
import { Calendar, Plus, QrCode, LayoutGrid, List, ChevronLeft, ChevronRight, Edit, Trash2, Building2, ChevronDown, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";

export default function Sessions() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [venueName, setVenueName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [viewMode, setViewMode] = useState<"list" | "week">("week");
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");

  const canManage = role === "lecturer" || role === "admin";
  const isAdmin = role === "admin";

  // Departments for admin filter
  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-for-sessions", user?.id, role],
    queryFn: async () => {
      if (role === "lecturer") {
        const { data, error } = await supabase
          .from("course_lecturers")
          .select("course_id, courses(id, code, name, department_id)")
          .eq("lecturer_id", user!.id);
        if (error) throw error;
        return (data || []).map((r: any) => r.courses).filter(Boolean);
      }
      const { data, error } = await supabase.from("courses").select("id, code, name, department_id").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Subjects for selected course
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-for-sessions", courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const { data, error } = await supabase.from("subjects").select("id, code, name").eq("course_id", courseId).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, courses(code, name, department_id), subjects(code, name)")
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // For admin: get lecturer profiles for sessions
  const { data: lecturerProfiles = {} } = useQuery({
    queryKey: ["session-lecturer-profiles"],
    queryFn: async () => {
      const lecturerIds = [...new Set(sessions.map((s: any) => s.created_by))];
      if (!lecturerIds.length) return {};
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", lecturerIds);
      return Object.fromEntries((data || []).map((p) => [p.id, p.full_name]));
    },
    enabled: isAdmin && sessions.length > 0,
  });

  // Filter sessions by department
  const filteredSessions = useMemo(() => {
    if (!isAdmin || selectedDeptId === "all") return sessions;
    return sessions.filter((s: any) => s.courses?.department_id === selectedDeptId);
  }, [sessions, selectedDeptId, isAdmin]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").insert({
        title, course_id: courseId, subject_id: subjectId || null, venue_name: venueName || null,
        duration_minutes: parseInt(durationMinutes), created_by: user!.id, status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: t("common.success"), description: "Session created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").update({
        title, course_id: courseId, subject_id: subjectId || null, venue_name: venueName || null, duration_minutes: parseInt(durationMinutes),
      }).eq("id", editingSession.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: t("common.success"), description: "Session updated" });
      resetForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: t("common.success"), description: "Session deleted" });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const resetForm = () => { setOpen(false); setEditingSession(null); setTitle(""); setCourseId(""); setSubjectId(""); setVenueName(""); setDurationMinutes("30"); };
  const openEdit = (session: any) => { setEditingSession(session); setTitle(session.title); setCourseId(session.course_id); setSubjectId(session.subject_id || ""); setVenueName(session.venue_name || ""); setDurationMinutes(String(session.duration_minutes)); setOpen(true); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!title.trim() || !courseId) return; editingSession ? updateMutation.mutate() : createMutation.mutate(); };
  const canEditSession = (session: any) => role === "admin" || (role === "lecturer" && session.created_by === user?.id);
  const statusColor = (status: string) => { switch (status) { case "active": return "default"; case "completed": return "secondary"; default: return "outline"; } };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);
  const dayNames = [t("sessions.monday"), t("sessions.tuesday"), t("sessions.wednesday"), t("sessions.thursday"), t("sessions.friday"), t("sessions.saturday"), t("sessions.sunday")];

  const sessionsByDay = useMemo(() => {
    const map: Record<string, typeof filteredSessions> = {};
    weekDays.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      map[key] = filteredSessions.filter((s) => s.session_date === key);
    });
    return map;
  }, [filteredSessions, weekDays]);

  // Admin: group sessions by lecturer for weekly view
  const sessionsByLecturer = useMemo(() => {
    if (!isAdmin) return null;
    const map = new Map<string, { name: string; sessions: typeof filteredSessions }>();
    filteredSessions.forEach((s: any) => {
      if (!map.has(s.created_by)) {
        map.set(s.created_by, { name: lecturerProfiles[s.created_by] || "—", sessions: [] });
      }
      map.get(s.created_by)!.sessions.push(s);
    });
    return Array.from(map.entries()).map(([id, data]) => ({ lecturerId: id, ...data }));
  }, [filteredSessions, isAdmin, lecturerProfiles]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("sessions.title")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("auth.department")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allDepartments")}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("week")} className="rounded-none">
              <LayoutGrid className="h-4 w-4 mr-1" />{t("sessions.weeklyView")}
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-none">
              <List className="h-4 w-4 mr-1" />{t("sessions.listView")}
            </Button>
          </div>
          {canManage && (
            <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />{t("sessions.create")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingSession ? t("common.edit") : t("sessions.create")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 1 Lecture" required />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("sessions.course")}</Label>
                    <Select value={courseId} onValueChange={(v) => { setCourseId(v); setSubjectId(""); }}>
                      <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                      <SelectContent>
                        {courses.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {courseId && subjects.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t("subjects.subject")}</Label>
                      <Select value={subjectId} onValueChange={setSubjectId}>
                        <SelectTrigger><SelectValue placeholder={t("subjects.selectSubject")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— {t("subjects.selectSubject")} —</SelectItem>
                          {subjects.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                  <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingSession ? t("common.save") : t("sessions.create")}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : viewMode === "week" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-sm">
              {format(weekDays[0], "dd MMM")} — {format(weekDays[6], "dd MMM yyyy")}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Admin: show sessions grouped by lecturer */}
          {isAdmin && sessionsByLecturer && sessionsByLecturer.length > 0 ? (
            <div className="space-y-4">
              {sessionsByLecturer.map((lecturer) => {
                const lecturerWeekSessions = weekDays.reduce((acc, day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const ds = lecturer.sessions.filter((s) => s.session_date === key);
                  return acc + ds.length;
                }, 0);
                if (lecturerWeekSessions === 0) return null;
                return (
                  <Card key={lecturer.lecturerId}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        {lecturer.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
                        {weekDays.map((day, i) => {
                          const key = format(day, "yyyy-MM-dd");
                          const isToday = isSameDay(day, new Date());
                          const daySessions = lecturer.sessions.filter((s) => s.session_date === key);
                          return (
                            <div key={key} className={`rounded-lg border p-2 min-h-[80px] ${isToday ? "border-primary bg-primary/5" : "border-border"}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayNames[i]}</span>
                                <span className={`text-xs ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{format(day, "dd")}</span>
                              </div>
                              <div className="space-y-1">
                                {daySessions.map((session: any) => (
                                  <div key={session.id} className={`rounded-md p-1.5 text-xs ${session.status === "active" ? "bg-primary/15 text-primary border border-primary/30" : session.status === "completed" ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground"}`}>
                                    <p className="font-medium truncate">{session.title}</p>
                                    <p className="text-[10px] opacity-75 truncate">{(session.courses as any)?.code}{(session as any).subjects && ` • ${(session as any).subjects.code}`}{session.venue_name && ` • ${session.venue_name}`}</p>
                                  </div>
                                ))}
                                {daySessions.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-1">—</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Non-admin or no grouped data: original weekly grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
              {weekDays.map((day, i) => {
                const key = format(day, "yyyy-MM-dd");
                const isToday = isSameDay(day, new Date());
                const daySessions = sessionsByDay[key] || [];
                return (
                  <div key={key} className={`rounded-lg border p-2 min-h-[120px] ${isToday ? "border-primary bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayNames[i]}</span>
                      <span className={`text-xs ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{format(day, "dd")}</span>
                    </div>
                    <div className="space-y-1.5">
                      {daySessions.map((session: any) => (
                        <div key={session.id} className={`rounded-md p-1.5 text-xs relative group/s ${
                          session.status === "active" ? "bg-primary/15 text-primary border border-primary/30"
                          : session.status === "completed" ? "bg-muted text-muted-foreground"
                          : "bg-secondary text-secondary-foreground"
                        } ${canEditSession(session) ? "cursor-pointer hover:opacity-80" : ""}`}
                          onClick={() => canEditSession(session) ? navigate(`/sessions/${session.id}/qr`) : null}
                        >
                        <p className="font-medium truncate">{session.title}</p>
                          <p className="text-[10px] opacity-75 truncate">
                            {(session.courses as any)?.code}
                            {(session as any).subjects && ` • ${(session as any).subjects.code}`}
                            {session.venue_name && ` • ${session.venue_name}`}
                          </p>
                          {canEditSession(session) && (
                            <div className="absolute top-0.5 right-0.5 hidden group-hover/s:flex gap-0.5">
                              <button className="p-0.5 rounded bg-background/80" onClick={(e) => { e.stopPropagation(); openEdit(session); }}>
                                <Edit className="h-3 w-3" />
                              </button>
                              <button className="p-0.5 rounded bg-background/80 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(session.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {daySessions.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-2">—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{t("dashboard.noSessions")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSessions.map((session: any) => (
            <Card key={session.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {(session.courses as any)?.code}
                      {(session as any).subjects && ` • ${(session as any).subjects.code} - ${(session as any).subjects.name}`}
                    </p>
                    <CardTitle className="text-base mt-1">{session.title}</CardTitle>
                    {isAdmin && lecturerProfiles[session.created_by] && (
                      <p className="text-xs text-muted-foreground mt-0.5">👤 {lecturerProfiles[session.created_by]}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canEditSession(session) && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(session)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(session.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <Badge variant={statusColor(session.status) as any}>{session.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{session.session_date}</span>
                  {session.venue_name && <span>📍 {session.venue_name}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{session.duration_minutes} {t("qr.minutes")}</p>
                {canEditSession(session) && (
                  <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate(`/sessions/${session.id}/qr`)}>
                    <QrCode className="h-4 w-4 mr-2" />{t("sessions.generateQr")}
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
