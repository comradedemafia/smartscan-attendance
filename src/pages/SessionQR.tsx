import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Clock, Users, CheckCircle2, StopCircle, TimerReset, UserCheck, UserX } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function SessionQR() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const { t, localeCode } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [qrValue, setQrValue] = useState("");

  // Fetch session
  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, courses(code, name)")
        .eq("id", sessionId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!sessionId,
  });

  // Fetch attendees with profiles (realtime via polling)
  const { data: attendees = [] } = useQuery({
    queryKey: ["session-attendees", sessionId],
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from("attendance_records")
        .select("id, scanned_at, status, user_id")
        .eq("session_id", sessionId!)
        .order("scanned_at", { ascending: true });
      if (error) throw error;
      if (!records || records.length === 0) return [];

      // Fetch profiles separately
      const userIds = records.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, university_id")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return records.map((r) => ({
        ...r,
        profile: profileMap.get(r.user_id) || null,
      }));
    },
    enabled: !!sessionId,
    refetchInterval: 3000,
  });

  // Fetch total enrolled students for this session's course
  const { data: enrolledCount = 0 } = useQuery({
    queryKey: ["session-enrolled-count", session?.course_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("course_id", session!.course_id);
      if (error) throw error;
      return data?.length ?? 0;
    },
    enabled: !!session?.course_id,
  });

  // Use count query properly
  const { data: enrolledTotal = 0 } = useQuery({
    queryKey: ["session-enrolled-total", session?.course_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("course_enrollments")
        .select("*", { count: "exact", head: true })
        .eq("course_id", session!.course_id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!session?.course_id,
  });

  // Generate / activate QR
  const activateMutation = useMutation({
    mutationFn: async () => {
      const secret = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + (session?.duration_minutes || 30) * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("sessions")
        .update({
          qr_code_secret: secret,
          qr_expires_at: expiresAt,
          status: "active",
        })
        .eq("id", sessionId!);
      if (error) throw error;
      return { secret, expiresAt };
    },
    onSuccess: async (data) => {
      const epoch = Math.floor(Date.now() / 10000);
      setQrValue(JSON.stringify({ session_id: sessionId, secret: data.secret, t: epoch }));
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      // Notify students
      try {
        await supabase.rpc("notify_enrolled_students", {
          _session_id: sessionId!,
          _title: t("notify.qrActiveTitle"),
          _message: t("notify.qrActiveMessage", { title: session?.title ?? "" }),
          _type: "qr",
        });
      } catch { /* ignore notification failure */ }
      toast({ title: t("common.success"), description: t("common.qrActivated") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Terminate session
  const terminateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "completed", qr_expires_at: new Date().toISOString(), qr_code_secret: null })
        .eq("id", sessionId!);
      if (error) throw error;
    },
    onSuccess: () => {
      setQrValue("");
      setTimeLeft(0);
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      toast({ title: t("common.success"), description: t("sessions.terminated") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Extend / modify time
  const extendMutation = useMutation({
    mutationFn: async (extraMinutes: number) => {
      const currentExpiry = session?.qr_expires_at ? new Date(session.qr_expires_at).getTime() : Date.now();
      const base = Math.max(currentExpiry, Date.now());
      const newExpiry = new Date(base + extraMinutes * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("sessions")
        .update({ qr_expires_at: newExpiry })
        .eq("id", sessionId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      toast({ title: t("common.success"), description: t("sessions.timeExtended") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Generate rotating QR value every 10 seconds
  useEffect(() => {
    if (!session?.qr_code_secret || !session?.qr_expires_at) return;
    const expires = new Date(session.qr_expires_at).getTime();
    if (expires <= Date.now()) return;

    const generateQr = () => {
      const epoch = Math.floor(Date.now() / 10000); // changes every 10 sec
      setQrValue(JSON.stringify({
        session_id: sessionId,
        secret: session.qr_code_secret,
        t: epoch,
      }));
    };
    generateQr();
    const interval = setInterval(generateQr, 10000);
    return () => clearInterval(interval);
  }, [session?.qr_code_secret, session?.qr_expires_at, sessionId]);

  // Countdown timer
  useEffect(() => {
    if (!session?.qr_expires_at) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(session.qr_expires_at!).getTime() - Date.now()) / 1000));
      setTimeLeft(diff);
      if (diff === 0) {
        setQrValue("");
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session?.qr_expires_at]);

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }, []);

  const isExpired = timeLeft !== null && timeLeft <= 0;
  const isActive = qrValue && !isExpired;

  // Lecturers cannot launch sessions that are completed/terminated, or whose
  // scheduled date is in the past (already happened).
  const todayStr = new Date().toISOString().slice(0, 10);
  const sessionPast = !!session?.session_date && session.session_date < todayStr;
  const sessionEnded = session?.status === "completed";
  const cannotLaunch = sessionPast || sessionEnded;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/sessions")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Button>

      <Card>
        <CardHeader className="text-center pb-2">
          <p className="text-xs text-muted-foreground font-mono">{(session?.courses as any)?.code}</p>
          <CardTitle className="text-xl">{session?.title}</CardTitle>
          {session?.venue_name && <p className="text-sm text-muted-foreground">📍 {session.venue_name}</p>}
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-6">
          {isActive ? (
            <>
              {/* Timer */}
              <div className="flex items-center gap-2 text-lg font-mono">
                <Clock className="h-5 w-5 text-primary" />
                <span className={timeLeft! < 60 ? "text-destructive" : "text-foreground"}>
                  {formatTime(timeLeft!)}
                </span>
                <Badge variant="default">{t("sessions.active")}</Badge>
              </div>

              {/* QR Code */}
              <div className="bg-white p-6 rounded-xl shadow-inner">
                <QRCodeSVG value={qrValue} size={280} level="H" />
              </div>

              <p className="text-sm text-muted-foreground text-center">
                {t("qr.timeRemaining")}: {formatTime(timeLeft!)}
              </p>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3 w-full justify-center">
                <Select onValueChange={(v) => extendMutation.mutate(parseInt(v))}>
                  <SelectTrigger className="w-[160px]">
                    <TimerReset className="h-4 w-4 mr-2" />
                    <SelectValue placeholder={t("sessions.extendTime")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">+5 {t("qr.minutes")}</SelectItem>
                    <SelectItem value="10">+10 {t("qr.minutes")}</SelectItem>
                    <SelectItem value="15">+15 {t("qr.minutes")}</SelectItem>
                    <SelectItem value="30">+30 {t("qr.minutes")}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="destructive"
                  onClick={() => terminateMutation.mutate()}
                  disabled={terminateMutation.isPending}
                >
                  <StopCircle className="h-4 w-4 mr-2" />
                  {t("sessions.terminate")}
                </Button>
              </div>
            </>
          ) : cannotLaunch ? (
            <div className="text-center space-y-3 py-8">
              <p className="text-lg font-medium text-destructive">
                {sessionEnded ? t("sessions.terminated") : t("qr.expired")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("sessions.endedCannotLaunch")}
              </p>
            </div>
          ) : isExpired ? (
            <div className="text-center space-y-4 py-8">
              <p className="text-lg font-medium text-destructive">{t("qr.expired")}</p>
              <Button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                {t("sessions.generateQr")} — {session?.duration_minutes} {t("qr.minutes")}
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4 py-8">
              <p className="text-muted-foreground">{t("qr.selectDuration")}: {session?.duration_minutes} {t("qr.minutes")}</p>
              <Button size="lg" onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                {t("sessions.generateQr")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live attendee list with realtime feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("analytics.liveAttendance")}
          </CardTitle>
          {/* Progress bar and counts */}
          {enrolledTotal > 0 && (
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  <span className="font-medium">{attendees.length}</span>
                  <span className="text-muted-foreground">/ {enrolledTotal} {t("analytics.enrolledTotal")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-destructive" />
                  <span className="text-destructive font-medium">{enrolledTotal - attendees.length}</span>
                  <span className="text-muted-foreground">{t("analytics.remaining")}</span>
                </div>
              </div>
              <Progress value={enrolledTotal > 0 ? (attendees.length / enrolledTotal) * 100 : 0} className="h-3" />
              <p className="text-xs text-muted-foreground text-center">
                {enrolledTotal > 0 ? Math.round((attendees.length / enrolledTotal) * 100) : 0}% {t("analytics.rate")}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("sessions.noScansYet")}
            </p>
          ) : (
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {attendees.map((a: any, i: number) => (
                <div key={a.id} className="flex items-center justify-between py-3 animate-in fade-in slide-in-from-left-2 duration-500">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}.</span>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{a.profile?.full_name || t("common.unknown")}</p>
                      <p className="text-xs text-muted-foreground">{a.profile?.university_id}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.scanned_at).toLocaleTimeString(localeCode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
