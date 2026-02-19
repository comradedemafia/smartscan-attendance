import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QrCode, CheckCircle2, XCircle, Camera } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { z } from "zod";

const qrPayloadSchema = z.object({
  session_id: z.string().uuid(),
  secret: z.string().min(1).max(200),
});

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

  const recordMutation = useMutation({
    mutationFn: async (parsed: { session_id: string; secret: string }) => {
      const { data, error } = await supabase.functions.invoke("verify-attendance", {
        body: parsed,
      });

      if (error) {
        // Edge function network/invocation error
        throw new Error(error.message || "Network error");
      }

      // The edge function returns JSON with error field on failure
      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: () => {
      setResult("success");
      toast({ title: t("qr.success"), description: t("qr.success") });
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
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setResult(null);
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
            recordMutation.mutate({ session_id: parsed.session_id, secret: parsed.secret });
          } catch {
            processedRef.current = false;
          }
        },
        () => {} // ignore scan failures
      );
    } catch (err: any) {
      toast({ title: t("common.error"), description: "Camera access denied", variant: "destructive" });
      setScanning(false);
    }
  }, [stopScanner, recordMutation, toast, t]);

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
          <div
            id="qr-reader"
            ref={containerRef}
            className="aspect-square bg-muted rounded-lg overflow-hidden"
          />

          {/* Result feedback */}
          {result === "success" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="h-6 w-6" />
              <p className="font-medium">{t("qr.success")}</p>
            </div>
          )}
          {result === "duplicate" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/10 text-amber-600">
              <XCircle className="h-6 w-6" />
              <p className="font-medium">{t("qr.alreadyScanned")}</p>
            </div>
          )}
          {result === "expired" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
              <p className="font-medium">{t("qr.expired")}</p>
            </div>
          )}
          {result === "error" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
              <p className="font-medium">{t("common.error")}</p>
            </div>
          )}

          {!scanning ? (
            <Button className="w-full" size="lg" onClick={startScanner}>
              <Camera className="h-4 w-4 mr-2" />
              {result ? "Scan Again" : t("qr.scan")}
            </Button>
          ) : (
            <Button className="w-full" variant="outline" onClick={stopScanner}>
              {t("common.cancel")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
