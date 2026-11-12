import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { QrCode, CheckCircle2, XCircle, Camera, ShieldAlert, Settings, KeyRound, WifiOff, Wifi, Upload, ShieldOff, UserCheck } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { useOtpBruteForceGuard } from "@/hooks/useOtpBruteForceGuard";
import SelfieCapture from "@/components/SelfieCapture";
import { FACE_MATCH_THRESHOLD, verifySelfieDataUrl, type SelfieVerificationPayload } from "@/lib/faceVerification";

const qrPayloadSchema = z.object({
  session_id: z.string().uuid(),
  secret: z.string().min(1).max(200),
});

type ScanStep = "scan" | "enter-reg-no" | "selfie" | "enter-otp" | "verified" | "no-totp" | "offline-saved";

interface OfflineScan {
  session_id: string;
  secret: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  registration_number?: string;
  selfie?: string;
}

const OFFLINE_QUEUE_KEY = "offline_scan_queue";

function getOfflineQueue(): OfflineScan[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch { return []; }
}

function saveOfflineQueue(queue: OfflineScan[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function addToOfflineQueue(scan: OfflineScan) {
  const queue = getOfflineQueue();
  queue.push(scan);
  saveOfflineQueue(queue);
}

function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

/** Best-effort geolocation capture (resolves null on failure/timeout). */
function getPosition(): Promise<{ latitude: number; longitude: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  });
}

/**
 * Invoke the attendance-otp function and normalize errors so callers can
 * branch on the server's `error` code (INVALID_OTP, REPLAY_DETECTED, ...).
 */
async function callOtp(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("attendance-otp", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      if (ctx?.json) {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      }
    } catch { /* ignore */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function ScanQR() {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<"success" | "duplicate" | "expired" | "error" | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState(getOfflineQueue().length);
  const [totpReady, setTotpReady] = useState<boolean | null>(null);

  const [scanStep, setScanStep] = useState<ScanStep>("scan");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [syncMode, setSyncMode] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [regNoError, setRegNoError] = useState<string | null>(null);
  const [selfiePayload, setSelfiePayload] = useState<SelfieVerificationPayload | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{ latitude?: number; longitude?: number }>({});
  const [offlineFlow, setOfflineFlow] = useState(false);
  const positionPromiseRef = useRef<Promise<{ latitude: number; longitude: number } | null> | null>(null);

  // Brute-force soft-guard based on user's own audit log
  const otpGuard = useOtpBruteForceGuard(pendingSessionId);

  // After QR scan — validate
  const initiateMutation = useMutation({
    mutationFn: async (parsed: { session_id: string; secret: string; registration_number: string; latitude?: number; longitude?: number }) => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "initiate", ...parsed },
      });
      if (error) throw new Error(error.message || t("common.networkError"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.needs_totp) {
        setPendingSessionId(data.session_id);
        setScanStep("selfie");
      } else if (data.no_totp) {
        setScanStep("no-totp");
      }
    },
    onError: (e: Error) => {
      if (e.message === "REG_NO_MISMATCH") {
        setRegNoError(t("qr.regNoMismatch"));
        setScanStep("enter-reg-no");
        return;
      }

      setScanStep("scan");
      if (e.message === "STUDENT_INACTIVE") {
        setResult("error");
        toast({ title: t("qr.inactiveStudent"), variant: "destructive" });
      } else if (e.message === "DUPLICATE") {
        setResult("duplicate");
        toast({ title: t("qr.alreadyScanned"), variant: "destructive" });
      } else if (e.message === "QR_EXPIRED") {
        setResult("expired");
        toast({ title: t("qr.expired"), variant: "destructive" });
      } else if (e.message === "OUTSIDE_RADIUS") {
        setResult("error");
        toast({ title: t("qr.locationError"), variant: "destructive" });
      } else {
        setResult("error");
        toast({ title: t("common.error"), description: e.message, variant: "destructive" });
      }
    },
  });

  // Verify TOTP and record attendance
  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (otpGuard.blocked) {
        throw new Error("RATE_LIMITED");
      }
      if (!selfiePayload) {
        throw new Error("SELFIE_REQUIRED");
      }
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: {
          action: "verify-scan-totp",
          session_id: pendingSessionId,
          code: otpCode,
          registration_number: registrationNumber.trim(),
          latitude: pendingLocation.latitude,
          longitude: pendingLocation.longitude,
          selfie: selfiePayload.dataUrl,
          face_match_distance: selfiePayload.faceMatchDistance,
          gender: selfiePayload.gender,
          gender_match: selfiePayload.genderMatch,
        },
      });
      if (error) throw new Error(error.message || t("common.networkError"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setScanStep("verified");
      setResult("success");
      toast({ title: t("qr.success"), description: t("otp.verified") });
      otpGuard.refresh();
    },
    onError: (e: Error) => {
      if (e.message === "REG_NO_MISMATCH") {
        setRegNoError(t("qr.regNoMismatch"));
        setScanStep("enter-reg-no");
        return;
      }
      if (e.message === "SELFIE_REQUIRED" || e.message === "INVALID_SELFIE" || e.message === "SELFIE_TOO_LARGE") {
        setScanStep("selfie");
        toast({ title: t("selfie.verifyError"), description: e.message, variant: "destructive" });
        return;
      }
      if (e.message === "RATE_LIMITED") {
        toast({
          title: t("otp.tooManyAttempts"),
          description: t("otp.cooldownDesc"),
          variant: "destructive",
        });
      } else if (e.message === "INVALID_OTP") {
        toast({ title: t("otp.invalidCode"), variant: "destructive" });
        otpGuard.refresh();
      } else if (e.message === "REPLAY_DETECTED") {
        setResult("duplicate");
        setScanStep("scan");
        toast({
          title: t("otp.replayTitle"),
          description: t("otp.replayDesc"),
          variant: "destructive",
        });
        otpGuard.refresh();
      } else if (e.message === "STUDENT_INACTIVE") {
        setResult("error");
        setScanStep("scan");
        toast({ title: t("qr.inactiveStudent"), variant: "destructive" });
      } else if (e.message === "DUPLICATE") {
        setResult("duplicate");
        setScanStep("scan");
        toast({ title: t("qr.alreadyScanned"), variant: "destructive" });
      } else if (e.message === "OUTSIDE_RADIUS") {
        setResult("error");
        setScanStep("scan");
        toast({ title: t("qr.locationError"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), description: e.message, variant: "destructive" });
        otpGuard.refresh();
      }
    },
  });

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleQrScanned = useCallback((parsed: { session_id: string; secret: string }) => {
    setPendingSecret(parsed.secret);
    setPendingSessionId(parsed.session_id);
    setRegistrationNumber("");
    setRegNoError(null);
    setSelfiePayload(null);
    setPendingLocation({});
    setOfflineFlow(!navigator.onLine);
    positionPromiseRef.current = getPosition();
    setScanStep("enter-reg-no");
  }, []);

  const resetToScan = useCallback(() => {
    setScanStep("scan");
    setResult(null);
    setPendingSessionId(null);
    setPendingSecret(null);
    setOtpCode("");
    setSyncMode(false);
    setRegistrationNumber("");
    setRegNoError(null);
    setSelfiePayload(null);
    setPendingLocation({});
    setOfflineFlow(false);
    positionPromiseRef.current = null;
  }, []);

  const handleRegNoSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    const value = registrationNumber.trim();

    if (!value) {
      setRegNoError(t("qr.regNoRequired"));
      return;
    }

    const expected = profile?.university_id?.trim().toLowerCase();
    if (expected && value.toLowerCase() !== expected) {
      setRegNoError(t("qr.regNoMismatch"));
      return;
    }

    if (!pendingSessionId || !pendingSecret) {
      resetToScan();
      return;
    }

    setRegNoError(null);
    const position = positionPromiseRef.current
      ? await positionPromiseRef.current
      : await getPosition();
    const location = {
      latitude: position?.latitude,
      longitude: position?.longitude,
    };
    setPendingLocation(location);

    if (!navigator.onLine) {
      setOfflineFlow(true);
      setScanStep("selfie");
      return;
    }

    setOfflineFlow(false);
    initiateMutation.mutate({
      session_id: pendingSessionId,
      secret: pendingSecret,
      registration_number: value,
      latitude: location.latitude,
      longitude: location.longitude,
    });
  }, [initiateMutation, pendingSecret, pendingSessionId, profile?.university_id, registrationNumber, resetToScan, t]);

  const handleSelfieVerified = useCallback((payload: SelfieVerificationPayload) => {
    if (!pendingSessionId || !pendingSecret) {
      resetToScan();
      return;
    }

    if (offlineFlow) {
      addToOfflineQueue({
        session_id: pendingSessionId,
        secret: pendingSecret,
        timestamp: new Date().toISOString(),
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        registration_number: registrationNumber.trim(),
        selfie: payload.dataUrl,
      });
      setOfflineCount(getOfflineQueue().length);
      setScanStep("offline-saved");
      toast({ title: t("offline.savedLocally") });
      return;
    }

    setSelfiePayload(payload);
    setScanStep("enter-otp");
    toast({ title: t("selfie.success") });
  }, [offlineFlow, pendingLocation.latitude, pendingLocation.longitude, pendingSecret, pendingSessionId, registrationNumber, resetToScan, t, toast]);

  const startScanner = useCallback(async () => {
    setResult(null);
    setScanStep("scan");
    setPendingSessionId(null);
    setPendingSecret(null);
    setOtpCode("");
    setRegistrationNumber("");
    setRegNoError(null);
    setSelfiePayload(null);
    setPendingLocation({});
    setOfflineFlow(false);
    positionPromiseRef.current = null;
    processedRef.current = false;

    setScanning(true);

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (processedRef.current) return;
          processedRef.current = true;

          try {
            const raw = JSON.parse(decodedText);
            const parsed = qrPayloadSchema.parse(raw) as { session_id: string; secret: string };
            stopScanner();
            handleQrScanned(parsed);
          } catch {
            processedRef.current = false;
          }
        },
        () => {}
      );
    } catch {
      toast({ title: t("common.error"), description: t("common.cameraAccessDenied"), variant: "destructive" });
      setScanning(false);
    }
  }, [stopScanner, handleQrScanned, toast, t]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    callOtp({ action: "totp-status" })
      .then((status) => {
        if (!cancelled) setTotpReady(Boolean(status?.enabled));
      })
      .catch(() => {
        if (!cancelled) setTotpReady(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); };
    const goOffline = () => { setIsOnline(false); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Sync offline queue: reconnecting requires an OTP before attendance is
  // actually recorded. The user enters one code which is applied to every
  // still-valid queued scan (the replay guard is scoped per session).
  const beginSync = useCallback(async () => {
    if (!getOfflineQueue().length) return;
    try {
      const status = await callOtp({ action: "totp-status" });
      if (!status?.enabled) {
        setScanStep("no-totp");
        return;
      }
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
      return;
    }
    setSyncMode(true);
    setPendingSessionId(null);
    setPendingSecret(null);
    setOtpCode("");
    setScanStep("enter-otp");
  }, [t, toast]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (otpGuard.blocked) throw new Error("RATE_LIMITED");
      const queue = getOfflineQueue();
      let synced = 0;
      let failed = 0;
      const remaining: OfflineScan[] = [];

      for (let i = 0; i < queue.length; i++) {
        const scan = queue[i];

        if (!scan.registration_number || !scan.selfie) {
          failed++;
          continue;
        }

        try {
          const init = await callOtp({
            action: "initiate",
            session_id: scan.session_id,
            secret: scan.secret,
            registration_number: scan.registration_number,
            latitude: scan.latitude,
            longitude: scan.longitude,
          });

          if (!init?.needs_totp) {
            failed++;
            continue;
          }

          let faceResult;
          try {
            faceResult = await verifySelfieDataUrl(
              profile?.avatar_url,
              scan.selfie,
              profile?.gender,
            );
          } catch (e) {
            const message = e instanceof Error ? e.message : "";
            if (message === "AVATAR_MISSING" || message === "AVATAR_FACE_NOT_FOUND") {
              failed++;
              continue;
            }
            remaining.push(...queue.slice(i));
            break;
          }

          if (
            !faceResult.faceDetected ||
            faceResult.faceMatchDistance == null ||
            faceResult.faceMatchDistance > FACE_MATCH_THRESHOLD ||
            faceResult.genderMatch === false
          ) {
            failed++;
            continue;
          }

          await callOtp({
            action: "verify-scan-totp",
            session_id: scan.session_id,
            code: otpCode,
            registration_number: scan.registration_number,
            latitude: scan.latitude,
            longitude: scan.longitude,
            selfie: scan.selfie,
            face_match_distance: faceResult.faceMatchDistance,
            gender: faceResult.gender,
            gender_match: faceResult.genderMatch,
          });
          synced++;
        } catch (e) {
          const message = e instanceof Error ? e.message : "error";
          if (message === "INVALID_OTP" || message === "RATE_LIMITED") {
            remaining.push(...queue.slice(i));
            break;
          }
          if (message === "DUPLICATE" || message === "REPLAY_DETECTED") {
            synced++;
            continue;
          }
          const permanent = [
            "OUTSIDE_RADIUS",
            "QR_EXPIRED",
            "Not enrolled",
            "Session not active",
            "Session not found",
            "Invalid QR code",
            "Invalid session ID",
            "TOTP not set up",
            "REG_NO_MISMATCH",
            "STUDENT_INACTIVE",
            "INVALID_SELFIE",
            "SELFIE_TOO_LARGE",
          ];
          if (permanent.includes(message)) {
            failed++;
            continue;
          }
          remaining.push(...queue.slice(i));
          break;
        }
      }

      if (remaining.length) saveOfflineQueue(remaining);
      else clearOfflineQueue();

      return { synced, failed, remaining: remaining.length };
    },
    onSuccess: ({ synced, failed, remaining }) => {
      setOfflineCount(remaining);
      setSyncMode(false);
      setOtpCode("");
      otpGuard.refresh();

      if (synced > 0) {
        setResult("success");
        setScanStep("verified");
        toast({
          title: t("offline.syncSuccess"),
          description: `${synced}/${synced + failed}`,
        });
        if (failed > 0) {
          toast({
            title: t("offline.syncPartial"),
            description: `${failed}`,
            variant: "destructive",
          });
        }
      } else {
        setScanStep("scan");
        toast({
          title: t("common.error"),
          description: failed ? `${failed}` : undefined,
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) => {
      setSyncMode(false);
      setScanStep("scan");
      if (e.message === "RATE_LIMITED") {
        toast({ title: t("otp.tooManyAttempts"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), description: e.message, variant: "destructive" });
      }
    },
  });

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("qr.scan")}</h1>
        <Badge variant={isOnline ? "default" : "destructive"} className="flex items-center gap-1">
          {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isOnline ? t("offline.online") : t("offline.offline")}
        </Badge>
      </div>

      {/* Offline queue banner */}
      {offlineCount > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <WifiOff className="h-4 w-4 text-amber-500" />
              <span>{t("offline.pendingScans")}: {offlineCount}</span>
            </div>
            {isOnline && (
              <Button size="sm" onClick={beginSync} disabled={syncMutation.isPending}>
                <Upload className="h-3 w-3 mr-1" />
                {syncMutation.isPending ? t("common.loading") : t("offline.syncNow")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <QrCode className="h-5 w-5" />
            {t("qr.scan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scanStep === "scan" && (!profile?.avatar_url || totpReady === false) && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{t("qr.setupRequired")}</p>
                {!profile?.avatar_url && <p className="text-xs opacity-90">{t("qr.setupAvatar")}</p>}
                {totpReady === false && <p className="text-xs opacity-90">{t("qr.setupTotp")}</p>}
                <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
                  <Link to="/settings">{t("qr.openSettings")}</Link>
                </Button>
              </div>
            </div>
          )}

          {/* Scanner viewport */}
          {scanStep === "scan" && (
            <div
              id="qr-reader"
              ref={containerRef}
              className="aspect-square bg-muted rounded-lg overflow-hidden"
            />
          )}

          {/* Registration number step */}
          {scanStep === "enter-reg-no" && (
            <form className="space-y-4" onSubmit={handleRegNoSubmit}>
              <div className="flex items-center gap-3 rounded-lg bg-primary/10 p-4 text-primary">
                <UserCheck className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("qr.enterRegNo")}</p>
                  <p className="text-sm text-muted-foreground">{t("qr.enterRegNoDesc")}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="registration-number">{t("qr.enterRegNo")}</Label>
                <Input
                  id="registration-number"
                  value={registrationNumber}
                  onChange={(event) => {
                    setRegistrationNumber(event.target.value);
                    setRegNoError(null);
                  }}
                  placeholder={t("qr.regNoPlaceholder")}
                  autoComplete="off"
                  autoFocus
                />
                {regNoError && (
                  <p className="text-sm text-destructive">{regNoError}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={initiateMutation.isPending}
              >
                {initiateMutation.isPending ? t("common.loading") : t("common.continue")}
              </Button>

              <Button type="button" variant="ghost" className="w-full" onClick={resetToScan}>
                {t("common.cancel")}
              </Button>
            </form>
          )}

          {/* Selfie verification step */}
          {scanStep === "selfie" && (
            <SelfieCapture
              avatarUrl={profile?.avatar_url}
              profileGender={profile?.gender}
              requireVerification={!offlineFlow}
              onVerified={handleSelfieVerified}
              onCancel={resetToScan}
            />
          )}

          {/* OTP Entry step */}
          {scanStep === "enter-otp" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
                <div>
                  <p className="font-medium">
                    {syncMode ? t("offline.syncNow") : t("otp.enterCode")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {syncMode
                      ? `${t("offline.pendingScans")}: ${offlineCount}`
                      : t("otp.openAuthApp")}
                  </p>
                </div>
              </div>

              {/* Brute-force soft-guard indicator */}
              {otpGuard.blocked ? (
                <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
                  <ShieldOff className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">
                      {t("otp.tooManyAttempts")}
                    </p>
                    <p className="text-xs opacity-90">
                      {t("otp.tryAgainIn")}{" "}
                      <span className="font-mono">{otpGuard.cooldownSecondsLeft}{t("courses.secondsShort")}</span>
                    </p>
                  </div>
                </div>
              ) : otpGuard.recentFailures >= 3 ? (
                <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">
                      {t("otp.warningAttempts")}
                    </p>
                    <p className="text-xs opacity-90">
                      {otpGuard.recentFailures}/{5} {t("otp.failuresWindow")}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => (syncMode ? syncMutation.mutate() : verifyMutation.mutate())}
                disabled={
                  otpCode.length !== 6 ||
                  verifyMutation.isPending ||
                  syncMutation.isPending ||
                  otpGuard.blocked
                }
              >
                {otpGuard.blocked
                  ? `${t("otp.waitSeconds")} ${otpGuard.cooldownSecondsLeft}s`
                  : verifyMutation.isPending || syncMutation.isPending
                    ? t("common.loading")
                    : t("otp.verify")}
              </Button>

              <Button variant="ghost" className="w-full" onClick={resetToScan}>
                {t("common.cancel")}
              </Button>
            </div>
          )}

          {/* No TOTP setup message */}
          {scanStep === "no-totp" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
                <ShieldAlert className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("otp.totpNotSetup")}</p>
                  <p className="text-sm">{t("otp.totpRequiredDesc")}</p>
                </div>
              </div>
              <Button asChild className="w-full" size="lg">
                <Link to="/settings">
                  <Settings className="h-4 w-4 mr-2" />
                  {t("otp.goToSettings")}
                </Link>
              </Button>
              <Button variant="ghost" className="w-full" onClick={resetToScan}>
                {t("common.cancel")}
              </Button>
            </div>
          )}

          {/* Offline saved */}
          {scanStep === "offline-saved" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 text-amber-600">
                <WifiOff className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("offline.savedLocally")}</p>
                  <p className="text-sm text-muted-foreground">{t("offline.willSyncLater")}</p>
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={resetToScan}>
                {t("common.done")}
              </Button>
            </div>
          )}

          {/* Success */}
          {scanStep === "verified" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <CheckCircle2 className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("qr.success")}</p>
                  <p className="text-sm text-muted-foreground">{t("otp.attendanceRecorded")}</p>
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={resetToScan}>
                {t("common.done")}
              </Button>
            </div>
          )}

          {/* Error feedback */}
          {result === "duplicate" && scanStep === "scan" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 text-amber-600">
              <XCircle className="h-6 w-6" />
              <p className="font-medium">{t("qr.alreadyScanned")}</p>
            </div>
          )}
          {result === "expired" && scanStep === "scan" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
              <p className="font-medium">{t("qr.expired")}</p>
            </div>
          )}
          {result === "error" && scanStep === "scan" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
              <p className="font-medium">{t("common.error")}</p>
            </div>
          )}

          {scanStep === "scan" && !scanning && (
            <Button className="w-full" size="lg" onClick={startScanner}>
              <Camera className="h-4 w-4 mr-2" />
              {result ? t("qr.scanAgain") : t("qr.scan")}
            </Button>
          )}
          {scanStep === "scan" && scanning && (
            <Button className="w-full" variant="outline" onClick={stopScanner}>
              {t("common.cancel")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
