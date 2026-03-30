import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { QrCode, CheckCircle2, XCircle, Camera, ShieldAlert, Settings, KeyRound, MapPin, Loader2, WifiOff, Wifi, Upload } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";

const qrPayloadSchema = z.object({
  session_id: z.string().uuid(),
  secret: z.string().min(1).max(200),
});

type ScanStep = "scan" | "getting-location" | "enter-otp" | "verified" | "no-totp";

export default function ScanQR() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<"success" | "duplicate" | "expired" | "error" | "outside-radius" | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(false);

  const [scanStep, setScanStep] = useState<ScanStep>("scan");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Get user's GPS location
  const getUserLocation = useCallback((): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("GPS_NOT_SUPPORTED"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) reject(new Error("GPS_DENIED"));
          else reject(new Error("GPS_ERROR"));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, []);

  // After QR scan — get location then validate
  const initiateMutation = useMutation({
    mutationFn: async (parsed: { session_id: string; secret: string; latitude: number; longitude: number }) => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "initiate", ...parsed },
      });
      if (error) throw new Error(error.message || "Network error");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.needs_totp) {
        setPendingSessionId(data.session_id);
        setScanStep("enter-otp");
      } else if (data.no_totp) {
        setScanStep("no-totp");
      }
    },
    onError: (e: any) => {
      setScanStep("scan");
      if (e.message === "DUPLICATE") {
        setResult("duplicate");
        toast({ title: t("qr.alreadyScanned"), variant: "destructive" });
      } else if (e.message === "QR_EXPIRED") {
        setResult("expired");
        toast({ title: t("qr.expired"), variant: "destructive" });
      } else if (e.message === "OUTSIDE_RADIUS") {
        setResult("outside-radius");
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
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: {
          action: "verify-scan-totp",
          session_id: pendingSessionId,
          code: otpCode,
          latitude: userLocation?.latitude,
          longitude: userLocation?.longitude,
        },
      });
      if (error) throw new Error(error.message || "Network error");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setScanStep("verified");
      setResult("success");
      toast({ title: t("qr.success"), description: t("otp.verified") });
    },
    onError: (e: any) => {
      if (e.message === "INVALID_OTP") {
        toast({ title: t("otp.invalidCode"), variant: "destructive" });
      } else if (e.message === "DUPLICATE") {
        setResult("duplicate");
        setScanStep("scan");
        toast({ title: t("qr.alreadyScanned"), variant: "destructive" });
      } else if (e.message === "OUTSIDE_RADIUS") {
        setResult("outside-radius");
        setScanStep("scan");
        toast({ title: t("qr.locationError"), variant: "destructive" });
      } else {
        toast({ title: t("common.error"), description: e.message, variant: "destructive" });
      }
    },
  });

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleQrScanned = useCallback(async (parsed: { session_id: string; secret: string }) => {
    setPendingSecret(parsed.secret);
    setPendingSessionId(parsed.session_id);
    setScanStep("getting-location");

    try {
      const loc = await getUserLocation();
      setUserLocation(loc);
      initiateMutation.mutate({
        session_id: parsed.session_id,
        secret: parsed.secret,
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    } catch (err: any) {
      if (err.message === "GPS_DENIED") {
        toast({ title: t("gps.permissionDenied"), description: t("gps.permissionDeniedDesc"), variant: "destructive" });
      } else {
        toast({ title: t("gps.errorGetting"), variant: "destructive" });
      }
      setScanStep("scan");
      setResult("error");
    }
  }, [getUserLocation, initiateMutation, toast, t]);

  const startScanner = useCallback(async () => {
    setResult(null);
    setScanStep("scan");
    setPendingSessionId(null);
    setPendingSecret(null);
    setOtpCode("");
    setUserLocation(null);
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
      toast({ title: t("common.error"), description: "Camera access denied", variant: "destructive" });
      setScanning(false);
    }
  }, [stopScanner, handleQrScanned, toast, t]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch {}
      }
    };
  }, []);

  const resetToScan = () => {
    setScanStep("scan");
    setResult(null);
    setPendingSessionId(null);
    setPendingSecret(null);
    setOtpCode("");
    setUserLocation(null);
  };

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("qr.scan")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <QrCode className="h-5 w-5" />
            {t("qr.scan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scanner viewport */}
          {scanStep === "scan" && (
            <div
              id="qr-reader"
              ref={containerRef}
              className="aspect-square bg-muted rounded-lg overflow-hidden"
            />
          )}

          {/* Getting location step */}
          {scanStep === "getting-location" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
                <div>
                  <p className="font-medium">{t("gps.gettingLocation")}</p>
                  <p className="text-sm text-muted-foreground">{t("gps.pleaseWait")}</p>
                </div>
              </div>
            </div>
          )}

          {/* OTP Entry step */}
          {scanStep === "enter-otp" && (
            <div className="space-y-5">
              {userLocation && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-primary text-sm">
                  <MapPin className="h-4 w-4" />
                  <span>{t("gps.locationVerified")}</span>
                </div>
              )}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("otp.enterCode")}</p>
                  <p className="text-sm text-muted-foreground">{t("otp.enterCodeFromSettings")}</p>
                </div>
              </div>

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
                onClick={() => verifyMutation.mutate()}
                disabled={otpCode.length !== 6 || verifyMutation.isPending}
              >
                {verifyMutation.isPending ? t("common.loading") : t("otp.verify")}
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
          {result === "outside-radius" && scanStep === "scan" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <MapPin className="h-6 w-6" />
              <div>
                <p className="font-medium">{t("qr.locationError")}</p>
                <p className="text-sm">{t("gps.outsideRadiusDesc")}</p>
              </div>
            </div>
          )}
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
              {result ? "Scan Again" : t("qr.scan")}
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
