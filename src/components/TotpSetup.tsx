import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Copy,
  Smartphone,
  ScanLine,
  KeyRound,
} from "lucide-react";

interface SetupData {
  secret: string;
  otpauth_url: string;
}

export default function TotpSetup() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  // Check if TOTP is already set up (server-side; never exposes the secret)
  const { data: hasTotp, isLoading } = useQuery({
    queryKey: ["totp-status", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "totp-status" },
      });
      if (error || data?.error) return false;
      return !!data?.enabled;
    },
    enabled: !!user,
  });

  // Setup mutation — creates a pending secret and returns a QR payload
  const setupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "setup-totp" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as SetupData;
    },
    onSuccess: (data) => {
      setSetupData(data);
      setVerifyCode("");
    },
    onError: (e: Error) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Verify the first code, which activates the pending secret
  const verifyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "verify-setup", code: verifyCode },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setSetupData(null);
      setVerifyCode("");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      toast({ title: t("common.success"), description: t("otp.totpEnabled") });
    },
    onError: (e: Error) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "disable-totp", code: disableCode },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setConfirmingDisable(false);
      setDisableCode("");
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      toast({ title: t("common.success"), description: t("otp.totpDisabled") });
    },
    onError: (e: Error) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const copySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    toast({ title: t("otp.codeCopied") });
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {t("otp.twoFactorAuth")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasTotp ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <div>
                <p className="font-medium text-sm">{t("otp.totpActive")}</p>
                <p className="text-xs text-muted-foreground">{t("otp.totpActiveDesc")}</p>
              </div>
            </div>
            {confirmingDisable ? (
              <div className="space-y-3 rounded-lg border border-destructive/30 p-3">
                <p className="text-sm text-muted-foreground">{t("otp.enterVerificationCode")}</p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={disableCode} onChange={setDisableCode}>
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
                  variant="destructive"
                  className="w-full"
                  onClick={() => disableMutation.mutate()}
                  disabled={disableCode.length !== 6 || disableMutation.isPending}
                >
                  <ShieldOff className="h-4 w-4 mr-2" />
                  {disableMutation.isPending ? t("common.loading") : t("otp.disableTotp")}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setConfirmingDisable(false);
                    setDisableCode("");
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setConfirmingDisable(true)}
                disabled={disableMutation.isPending}
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                {t("otp.disableTotp")}
              </Button>
            )}
          </div>
        ) : setupData ? (
          <div className="space-y-5">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <Smartphone className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="font-medium text-sm">{t("otp.step1Title")}</p>
                <p className="text-sm text-muted-foreground">{t("otp.step1Desc")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("otp.downloadLinks")} Google Authenticator · Authy
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <ScanLine className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div className="w-full">
                <p className="font-medium text-sm">{t("otp.step2Title")}</p>
                <p className="text-sm text-muted-foreground">{t("otp.scanQrWithApp")}</p>
                <div className="mt-3 flex justify-center rounded-lg bg-white p-4">
                  <QRCodeSVG value={setupData.otpauth_url} size={200} level="M" />
                </div>
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-muted-foreground">{t("otp.manualEntry")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">
                      {setupData.secret}
                    </code>
                    <Button variant="outline" size="sm" onClick={copySecret}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <KeyRound className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div className="space-y-3 w-full">
                <div>
                  <p className="font-medium text-sm">{t("otp.step3Title")}</p>
                  <p className="text-sm text-muted-foreground">{t("otp.step3Desc")}</p>
                </div>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
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
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyCode.length !== 6 || verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? t("common.loading") : t("otp.verify")}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setSetupData(null);
                    setVerifyCode("");
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
              <Shield className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="font-medium">{t("otp.totpNotSetup")}</p>
                <p className="text-sm text-muted-foreground">{t("otp.totpNotSetupDesc")}</p>
              </div>
            </div>
            <Button
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
            >
              <Shield className="h-4 w-4 mr-2" />
              {setupMutation.isPending ? t("common.loading") : t("otp.setupTotp")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
