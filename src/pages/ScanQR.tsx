import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QrCode, CheckCircle2, XCircle, Camera, Shield, Smartphone, MessageSquare, Mail } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { z } from "zod";

const qrPayloadSchema = z.object({
  session_id: z.string().uuid(),
  secret: z.string().min(1).max(200),
});

type OtpStep = "scan" | "choose-method" | "enter-otp";
type OtpMethod = "totp" | "sms" | "email";

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

  // 2FA State
  const [otpStep, setOtpStep] = useState<OtpStep>("scan");
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [otpMethods, setOtpMethods] = useState<{ totp: boolean; sms: boolean; email: boolean }>({ totp: false, sms: false, email: false });
  const [selectedMethod, setSelectedMethod] = useState<OtpMethod | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [phoneHint, setPhoneHint] = useState("");
  const [emailHint, setEmailHint] = useState("");

  // Step 1: Initiate OTP after QR scan
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
      setOtpToken(data.token);
      setOtpMethods(data.methods);
      // If only one method available, auto-select it
      const availableMethods = [
        data.methods.totp && "totp",
        data.methods.sms && "sms",
        data.methods.email && "email",
      ].filter(Boolean) as OtpMethod[];

      if (availableMethods.length === 1) {
        const method = availableMethods[0];
        setSelectedMethod(method);
        if (method === "sms") {
          sendSmsMutation.mutate(data.token);
        } else if (method === "email") {
          sendEmailMutation.mutate(data.token);
        } else {
          setOtpStep("enter-otp");
        }
      } else if (availableMethods.length > 1) {
        setOtpStep("choose-method");
      } else {
        toast({ title: t("otp.noMethodSetup"), variant: "destructive" });
        setResult("error");
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

  // Step 2: Send SMS OTP
  const sendSmsMutation = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "send-sms", token },
      });
      if (error) throw new Error(error.message || "Network error");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setPhoneHint(data.phone_hint || "");
      setOtpStep("enter-otp");
      toast({ title: t("otp.smsSent") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Step 2b: Send Email OTP
  const sendEmailMutation = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "send-email", token },
      });
      if (error) throw new Error(error.message || "Network error");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setEmailHint(data.email_hint || "");
      setOtpStep("enter-otp");
      toast({ title: t("otp.emailSent") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Step 3: Verify OTP
  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "verify", token: otpToken, code: otpCode, method: selectedMethod },
      });
      if (error) throw new Error(error.message || "Network error");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setResult("success");
      setOtpStep("scan");
      toast({ title: t("qr.success"), description: t("otp.verified") });
    },
    onError: (e: any) => {
      if (e.message === "INVALID_OTP") {
        toast({ title: t("otp.invalidCode"), variant: "destructive" });
      } else if (e.message === "OTP_EXPIRED") {
        toast({ title: t("otp.otpExpired"), variant: "destructive" });
        setOtpStep("scan");
        setResult("expired");
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

  const startScanner = useCallback(async () => {
    setResult(null);
    setOtpStep("scan");
    setOtpToken(null);
    setOtpCode("");
    setSelectedMethod(null);
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

  const handleMethodSelect = (method: OtpMethod) => {
    setSelectedMethod(method);
    if (method === "sms" && otpToken) {
      sendSmsMutation.mutate(otpToken);
    } else if (method === "email" && otpToken) {
      sendEmailMutation.mutate(otpToken);
    } else {
      setOtpStep("enter-otp");
    }
  };

  const handleVerifyOtp = () => {
    if (otpCode.length === 6) {
      verifyMutation.mutate();
    }
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
          {/* Scanner viewport - only show during scan step */}
          {otpStep === "scan" && (
            <div
              id="qr-reader"
              ref={containerRef}
              className="aspect-square bg-muted rounded-lg overflow-hidden"
            />
          )}

          {/* 2FA: Choose method */}
          {otpStep === "choose-method" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <Shield className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("otp.verificationRequired")}</p>
                  <p className="text-sm text-muted-foreground">{t("otp.chooseMethod")}</p>
                </div>
              </div>

              <div className="grid gap-3">
                {otpMethods.totp && (
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex items-center gap-4 justify-start"
                    onClick={() => handleMethodSelect("totp")}
                  disabled={sendSmsMutation.isPending || sendEmailMutation.isPending}
                  >
                    <Smartphone className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{t("otp.appOtp")}</p>
                      <p className="text-sm text-muted-foreground">{t("otp.appOtpDesc")}</p>
                    </div>
                  </Button>
                )}
                {otpMethods.sms && (
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex items-center gap-4 justify-start"
                    onClick={() => handleMethodSelect("sms")}
                    disabled={sendSmsMutation.isPending || sendEmailMutation.isPending}
                  >
                    <MessageSquare className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{t("otp.smsOtp")}</p>
                      <p className="text-sm text-muted-foreground">{t("otp.smsOtpDesc")}</p>
                    </div>
                  </Button>
                )}
                {otpMethods.email && (
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex items-center gap-4 justify-start"
                    onClick={() => handleMethodSelect("email")}
                    disabled={sendSmsMutation.isPending || sendEmailMutation.isPending}
                  >
                    <Mail className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="font-medium">{t("otp.emailOtp")}</p>
                      <p className="text-sm text-muted-foreground">{t("otp.emailOtpDesc")}</p>
                    </div>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 2FA: Enter OTP code */}
          {otpStep === "enter-otp" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
                <Shield className="h-6 w-6" />
                <div>
                  <p className="font-medium">{t("otp.enterCode")}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedMethod === "sms"
                      ? `${t("otp.codeSentTo")} ****${phoneHint}`
                      : selectedMethod === "email"
                      ? `${t("otp.codeSentToEmail")} ${emailHint}`
                      : t("otp.openAuthApp")}
                  </p>
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
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6 || verifyMutation.isPending}
              >
                {verifyMutation.isPending ? t("common.loading") : t("otp.verify")}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setOtpStep("scan");
                  setOtpCode("");
                  setOtpToken(null);
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          )}

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

          {otpStep === "scan" && !scanning && (
            <Button className="w-full" size="lg" onClick={startScanner}>
              <Camera className="h-4 w-4 mr-2" />
              {result ? "Scan Again" : t("qr.scan")}
            </Button>
          )}
          {otpStep === "scan" && scanning && (
            <Button className="w-full" variant="outline" onClick={stopScanner}>
              {t("common.cancel")}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
