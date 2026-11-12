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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, QrCode, LayoutGrid, List, ChevronLeft, ChevronRight, Edit, Trash2, Building2, ChevronDown, Users, GraduationCap, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";

export default function Sessions() {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const sessionStatusLabel = (status: string) => {
    switch (status) {
      case "active": return t("sessions.active");
      case "scheduled": return t("sessions.scheduled");
      case "completed": return t("sessions.completed");
      case "terminated": return t("sessions.statusTerminated");
      default: return status;
    }
  };
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Session dialog state
  const [open, setOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  
  const [venueName, setVenueName] = useState("");
  const [customVenue, setCustomVenue] = useState("");
  const [sessionDate, setSessionDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(() => format(new Date(), "HH:mm"));
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("100");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);


  const [viewMode, setViewMode] = useState<"list" | "week">("week");
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [selectedFilterLevel, setSelectedFilterLevel] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const canManage = role === "lecturer" || role === "admin";
  const isAdmin = role === "admin";

  // Predefined venue list (per institution)
  const VENUE_OPTIONS = [
    "VIP",
    "NGUVANA HALL",
    "MSIGALA HALL",
    "LIBRARY",
    "COMPUTER ROOM",
    "OLD LIBRARY",
  ];

  // Departments for admin filter
  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: allLevels = [] } = useQuery({
    queryKey: ["levels-for-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("levels").select("id, name, code, department_id, sort_order").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-for-sessions", user?.id, role],
    queryFn: async () => {
      if (role === "lecturer") {
        // Modules admin assigned to this lecturer
        const { data: assigns, error: aErr } = await supabase
          .from("course_lecturers")
          .select("course_id")
          .eq("lecturer_id", user!.id);
        if (aErr) throw aErr;
        const ids = (assigns || []).map((a: any) => a.course_id);
        if (!ids.length) return [];
        const { data, error } = await supabase
          .from("courses")
          .select("id, code, name, department_id, level_id")
          .in("id", ids)
          .order("name");
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("courses").select("id, code, name, department_id, level_id").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Filter courses by selected level in the form
  const filteredFormCourses = useMemo(() => {
    if (!selectedLevelId) return courses;
    return courses.filter((c: any) => c.level_id === selectedLevelId);
  }, [courses, selectedLevelId]);

  // Get unique levels that have courses (for the form dropdown)
  const availableLevels = useMemo(() => {
    const levelIds = new Set(courses.map((c: any) => c.level_id).filter(Boolean));
    return allLevels.filter((l) => levelIds.has(l.id));
  }, [courses, allLevels]);


  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", role, user?.id],
    queryFn: async () => {
      if (role === "lecturer") {
        // Only sessions created by this lecturer
        const { data, error } = await supabase
          .from("sessions")
          .select("*, courses(code, name, department_id, level_id)")
          .eq("created_by", user!.id)
          .order("session_date", { ascending: false });
        if (error) throw error;
        return data;
      }
      if (role === "student") {
        // Only sessions for enrolled courses
        const { data: enrollments } = await supabase.from("course_enrollments").select("course_id").eq("user_id", user!.id);
        const courseIds = (enrollments || []).map(e => e.course_id);
        if (courseIds.length === 0) return [];
        const { data, error } = await supabase
          .from("sessions")
          .select("*, courses(code, name, department_id, level_id)")
          .in("course_id", courseIds)
          .order("session_date", { ascending: false });
        if (error) throw error;
        return data;
      }
      // Admin sees all
      const { data, error } = await supabase
        .from("sessions")
        .select("*, courses(code, name, department_id, level_id)")
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
    let result = sessions;
    if (isAdmin && selectedDeptId !== "all") {
      result = result.filter((s: any) => s.courses?.department_id === selectedDeptId);
    }
    if (selectedFilterLevel !== "all") {
      result = result.filter((s: any) => s.courses?.level_id === selectedFilterLevel);
    }
    if (selectedStatus !== "all") {
      const today = new Date().toISOString().slice(0, 10);
      result = result.filter((s: any) => {
        if (selectedStatus === "active") return s.status === "active";
        if (selectedStatus === "completed") return s.status === "completed" || (s.session_date && s.session_date < today);
        if (selectedStatus === "scheduled") return s.status === "scheduled" && s.session_date && s.session_date >= today;
        return true;
      });
    }
    return result;
  }, [sessions, selectedDeptId, selectedFilterLevel, selectedStatus, isAdmin]);

  const buildSessionFields = () => {
    const finalVenue = venueName === "__custom__" ? customVenue.trim() : venueName;
    const start = new Date(`${sessionDate}T${startTime}:00`);
    return {
      title,
      course_id: courseId,
      venue_name: finalVenue || null,
      duration_minutes: parseInt(durationMinutes, 10),
      session_date: sessionDate,
      start_time: start.toISOString(),
      latitude: latitude.trim() ? Number(latitude) : null,
      longitude: longitude.trim() ? Number(longitude) : null,
      location_radius_meters: radiusMeters.trim() ? Number(radiusMeters) : null,
    };
  };

  // ===== SESSION MUTATIONS =====
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").insert({
        ...buildSessionFields(), created_by: user!.id, status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      try {
        const { data: newSessions } = await supabase
          .from("sessions").select("id").eq("created_by", user!.id)
          .order("created_at", { ascending: false }).limit(1);
        if (newSessions?.[0]) {
          await supabase.rpc("notify_enrolled_students", {
            _session_id: newSessions[0].id,
            _title: t("notify.newSessionTitle"),
            _message: t("notify.newSessionMessage", { title }),
            _type: "session",
          });
        }
      } catch { /* ignore notification failure */ }
      toast({ title: t("common.success"), description: t("common.sessionCreated") });
      resetSessionForm();
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sessions").update(buildSessionFields()).eq("id", editingSession.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: t("common.success"), description: t("common.sessionUpdated") });
      resetSessionForm();
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
      toast({ title: t("common.success"), description: t("common.sessionDeleted") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });


  const resetSessionForm = () => {
    setOpen(false);
    setEditingSession(null);
    setTitle("");
    setCourseId("");
    setVenueName("");
    setCustomVenue("");
    setSessionDate(format(new Date(), "yyyy-MM-dd"));
    setStartTime(format(new Date(), "HH:mm"));
    setLatitude("");
    setLongitude("");
    setRadiusMeters("100");
    setDurationMinutes("30");
    setSelectedLevelId("");
  };
  const openEdit = (session: any) => {
    setEditingSession(session);
    setTitle(session.title);
    setCourseId(session.course_id);
    const preset = VENUE_OPTIONS.includes(session.venue_name);
    setVenueName(session.venue_name ? (preset ? session.venue_name : "__custom__") : "");
    setCustomVenue(preset ? "" : session.venue_name || "");
    setSessionDate(session.session_date || format(new Date(session.start_time || Date.now()), "yyyy-MM-dd"));
    setStartTime(format(new Date(session.start_time || Date.now()), "HH:mm"));
    setLatitude(session.latitude == null ? "" : String(session.latitude));
    setLongitude(session.longitude == null ? "" : String(session.longitude));
    setRadiusMeters(session.location_radius_meters == null ? "100" : String(session.location_radius_meters));
    setDurationMinutes(String(session.duration_minutes));
    const course = courses.find((c: any) => c.id === session.course_id);
    setSelectedLevelId(course?.level_id || "");
    setOpen(true);
  };
  const handleSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !courseId) return;
    const finalVenue = venueName === "__custom__" ? customVenue.trim() : venueName;
    if (!finalVenue) {
      toast({ title: t("common.error"), description: t("common.selectVenueRequired"), variant: "destructive" });
      return;
    }
    if (!sessionDate || !startTime || Number.isNaN(new Date(`${sessionDate}T${startTime}:00`).getTime())) {
      toast({ title: t("common.error"), description: t("sessions.invalidDateTime"), variant: "destructive" });
      return;
    }
    const hasLat = latitude.trim() !== "";
    const hasLng = longitude.trim() !== "";
    if (hasLat !== hasLng) {
      toast({ title: t("common.error"), description: t("sessions.invalidCoordinates"), variant: "destructive" });
      return;
    }
    if (hasLat) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        toast({ title: t("common.error"), description: t("sessions.invalidCoordinates"), variant: "destructive" });
        return;
      }
    }
    const radius = Number(radiusMeters || "100");
    if (!Number.isFinite(radius) || radius < 10 || radius > 5000) {
      toast({ title: t("common.error"), description: t("sessions.invalidRadius"), variant: "destructive" });
      return;
    }
    if (editingSession) updateMutation.mutate(); else createMutation.mutate();
  };
  const canEditSession = (session: any) => role === "admin" || (role === "lecturer" && session.created_by === user?.id);
  const isSessionLaunchable = (session: any) => {
    const today = new Date().toISOString().slice(0, 10);
    if (session.status === "completed") return false;
    if (session.session_date && session.session_date < today) return false;
    return true;
  };
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
      {role === "lecturer" && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3 flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <div className="text-sm">
              <span className="text-muted-foreground">{t("common.modulesYouTeach")} </span>
              <span className="font-semibold text-foreground">{courses.length}</span>
              <span className="text-muted-foreground ml-3">{t("sessions.title")}: </span>
              <span className="font-semibold text-foreground">{sessions.length}</span>
              {courses.length === 0 && (
                <span className="ml-3 text-amber-600">{t("common.noModulesAssigned")}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("sessions.title")}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("common.semester")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allSemesters")}</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Level/Programme filter */}
          {allLevels.length > 0 && (
            <Select value={selectedFilterLevel} onValueChange={setSelectedFilterLevel}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("reports.selectLevel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.allCourses")}</SelectItem>
                {allLevels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{l.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Session status filter */}
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("sessions.statusFilter")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sessions.allStatuses")}</SelectItem>
              <SelectItem value="scheduled">{t("sessions.upcoming")}</SelectItem>
              <SelectItem value="active">{t("sessions.ongoing")}</SelectItem>
              <SelectItem value="completed">{t("sessions.completed")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("week")} className="rounded-none">
              <LayoutGrid className="h-4 w-4 mr-1" />{t("sessions.weeklyView")}
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="rounded-none">
              <List className="h-4 w-4 mr-1" />{t("sessions.listView")}
            </Button>
          </div>
          {canManage && !isAdmin && (
            <>
              {/* Create Session Dialog */}
              <Dialog open={open} onOpenChange={(o) => { if (!o) resetSessionForm(); setOpen(o); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />{t("sessions.create")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingSession ? t("common.edit") : t("sessions.create")}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSessionSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("common.title")}</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("sessions.titlePlaceholder")} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("auth.programme")}</Label>
                      <Select
                        value={selectedLevelId}
                        onValueChange={(v) => { setSelectedLevelId(v); setCourseId(""); }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={availableLevels.length === 0 ? t("sessions.noAssignedModules") : t("auth.selectProgramme")} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLevels.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("common.noProgrammes")}</div>
                          ) : (
                            availableLevels.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("sessions.course")}</Label>
                      <Select
                        value={courseId}
                        onValueChange={setCourseId}
                        disabled={!selectedLevelId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("sessions.selectModule")} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredFormCourses.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.code} - {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{t("sessions.date")}</Label>
                        <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("sessions.time")}</Label>
                        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("sessions.venue")} <span className="text-destructive">*</span></Label>
                      <Select value={venueName} onValueChange={setVenueName} required>
                        <SelectTrigger>
                          <SelectValue placeholder={t("sessions.selectVenue")} />
                        </SelectTrigger>
                        <SelectContent>
                          {VENUE_OPTIONS.map((v) => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                          <SelectItem value="__custom__">{t("sessions.customVenue")}</SelectItem>
                        </SelectContent>
                      </Select>
                      {venueName === "__custom__" && (
                        <Input
                          value={customVenue}
                          onChange={(e) => setCustomVenue(e.target.value)}
                          placeholder={t("sessions.customVenuePlaceholder")}
                          required
                        />
                      )}
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
                    <div className="space-y-2 rounded-lg border border-border/60 p-3">
                      <Label className="text-xs">{t("sessions.geofence")}</Label>
                      <p className="text-[11px] text-muted-foreground">{t("sessions.geofenceHint")}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder={t("sessions.latitude")} />
                        <Input inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder={t("sessions.longitude")} />
                      </div>
                      <Input inputMode="numeric" value={radiusMeters} onChange={(e) => setRadiusMeters(e.target.value)} placeholder={t("sessions.radius")} />
                    </div>
                    <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingSession ? t("common.save") : t("sessions.create")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
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
                                    <p className="text-[10px] opacity-75 truncate">{(session.courses as any)?.code}{session.venue_name && ` • ${session.venue_name}`}</p>
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
                        } ${canEditSession(session) && isSessionLaunchable(session) ? "cursor-pointer hover:opacity-80" : ""}`}
                          onClick={() => canEditSession(session) && isSessionLaunchable(session) ? navigate(`/sessions/${session.id}/qr`) : null}
                        >
                        <p className="font-medium truncate">{session.title}</p>
                          <p className="text-[10px] opacity-75 truncate">
                            {(session.courses as any)?.code}
                            {session.venue_name && ` • ${session.venue_name}`}
                          </p>
                          {canEditSession(session) && (
                            <div className="absolute top-0.5 right-0.5 hidden group-hover/s:flex gap-0.5">
                              <button className="p-0.5 rounded bg-background/80" onClick={(e) => { e.stopPropagation(); openEdit(session); }}>
                                <Edit className="h-3 w-3" />
                              </button>
                              <button className="p-0.5 rounded bg-background/80 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteSessionId(session.id); }}>
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
                      </p>
                      <CardTitle className="text-base mt-1">{session.title}</CardTitle>
                      {(() => {
                        const levelId = (session.courses as any)?.level_id;
                        const level = levelId ? allLevels.find(l => l.id === levelId) : null;
                        return level ? (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" />{level.code}
                          </p>
                        ) : null;
                      })()}
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteSessionId(session.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <Badge variant={statusColor(session.status) as any}>{sessionStatusLabel(session.status)}</Badge>
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
                  isSessionLaunchable(session) ? (
                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate(`/sessions/${session.id}/qr`)}>
                      <QrCode className="h-4 w-4 mr-2" />{t("sessions.generateQr")}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full mt-2" disabled title={t("sessions.endedExpired")}>
                      <QrCode className="h-4 w-4 mr-2" />{session.status === "completed" ? t("sessions.terminated") : t("qr.expired")}
                    </Button>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!deleteSessionId}
        onOpenChange={(open) => !open && setDeleteSessionId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDeleteSession")}
        onConfirm={() => {
          if (deleteSessionId) deleteMutation.mutate(deleteSessionId);
          setDeleteSessionId(null);
        }}
      />
    </div>
  );
}