import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QrCode, CheckCircle2, XCircle, Camera, Shield, ShieldAlert, Settings, KeyRound } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { z } from "zod";

const qrPayloadSchema = z.object({
  session_id: z.string().uuid(),
  secret: z.string().min(1).max(200),
});

type ScanStep = "scan" | "verified" | "no-totp";

export default function ScanQR() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<"success" | "duplicate" | "expired" | "error" | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(false);

  const [scanStep, setScanStep] = useState<ScanStep>("scan");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Initiate after QR scan - auto-verifies if TOTP is set up
  const initiateMutation = useMutation({
    mutationFn: async (parsed: { session_id: string; secret: string }) => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "initiate", ...parsed },
      });
      if (error) throw new Error(error.message || "Network error");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.auto_verified) {
        // TOTP was generated server-side and attendance recorded
        setGeneratedCode(data.totp_code);
        setScanStep("verified");
        setResult("success");
        toast({ title: t("qr.success"), description: t("otp.verified") });
      } else {
        // No TOTP set up
        setScanStep("no-totp");
      }
    },
    onError: (e: any) => {
      if (e.message === "DUPLICATE") {
        setResult("duplicate");
        toast({ title: t("qr.alreadyScanned"), variant: "destructive" });
      } else if (e.message === "QR_EXPIRED") {
        setResult("expired");
        toast({ title: t("qr.expired"), variant: "destructive" });
      } else {
        setResult("error");
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

  const startScanner = useCallback(async () => {
    setResult(null);
    setScanStep("scan");
    setGeneratedCode(null);
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
            const parsed = qrPayloadSchema.parse(raw);
            stopScanner();
            initiateMutation.mutate({ session_id: parsed.session_id, secret: parsed.secret });
          } catch {
            processedRef.current = false;
          }
        },
        () => {}
      );
    } catch (err: any) {
      toast({ title: t("common.error"), description: "Camera access denied", variant: "destructive" });
      setScanning(false);
    }
  }, [stopScanner, initiateMutation, toast, t]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch {}
      }
    };
  }, []);

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
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setScanStep("scan")}
              >
                {t("common.cancel")}
              </Button>
            </div>
          )}

          {/* Auto-verified popup with generated code */}
          {scanStep === "verified" && generatedCode && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <CheckCircle2 className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("qr.success")}</p>
                  <p className="text-sm text-muted-foreground">{t("otp.verified")}</p>
                </div>
              </div>

              {/* Code display like authenticator app */}
              <div className="rounded-xl border-2 border-primary/20 bg-card p-6 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">{t("otp.verificationCode")}</span>
                </div>
                <div className="flex justify-center">
                  <div className="flex gap-2">
                    {generatedCode.split("").map((digit, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center w-11 h-14 rounded-lg bg-primary/10 border border-primary/20 text-2xl font-bold text-primary font-mono"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs text-muted-foreground text-center">{t("otp.autoVerified")}</p>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  setScanStep("scan");
                  setResult(null);
                  setGeneratedCode(null);
                }}
              >
                {t("common.done")}
              </Button>
            </div>
          )}

          {/* Result feedback (for errors) */}
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
