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
import { ArrowLeft, Clock, Users, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function SessionQR() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
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
    onSuccess: (data) => {
      setQrValue(JSON.stringify({ session_id: sessionId, secret: data.secret }));
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      toast({ title: t("common.success"), description: "QR Code activated!" });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Set QR value from existing session data
  useEffect(() => {
    if (session?.qr_code_secret && session?.qr_expires_at) {
      const expires = new Date(session.qr_expires_at).getTime();
      if (expires > Date.now()) {
        setQrValue(JSON.stringify({ session_id: sessionId, secret: session.qr_code_secret }));
      }
    }
  }, [session, sessionId]);

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
            </>
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

      {/* Live attendee list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("attendance.title")} ({attendees.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No students have scanned yet
            </p>
          ) : (
            <div className="divide-y divide-border">
              {attendees.map((a: any, i: number) => (
                <div key={a.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}.</span>
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{a.profile?.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{a.profile?.university_id}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.scanned_at).toLocaleTimeString()}
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
