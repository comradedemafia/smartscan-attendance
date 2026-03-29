import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function TotpSetup() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<{ secret: string; uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");

  // Check if TOTP is already set up
  const { data: hasTotp, isLoading } = useQuery({
    queryKey: ["totp-status", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("profiles")
        .select("totp_secret")
        .eq("id", user.id)
        .single();
      return !!data?.totp_secret;
    },
    enabled: !!user,
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "setup-totp" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { secret: string; uri: string };
    },
    onSuccess: (data) => {
      setSetupData(data);
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "disable-totp" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      setSetupData(null);
      toast({ title: t("common.success"), description: t("otp.totpDisabled") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const verifySetupMutation = useMutation({
    mutationFn: async () => {
      // Verify by calling the edge function to check the code
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "verify-setup", code: verifyCode },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      setSetupData(null);
      setVerifyCode("");
      toast({ title: t("common.success"), description: t("otp.totpEnabled") });
    },
    onError: () => {
      toast({ title: t("otp.invalidCode"), variant: "destructive" });
    },
  });

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
        {hasTotp && !setupData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
              <div>
                <p className="font-medium">{t("otp.totpActive")}</p>
                <p className="text-sm text-muted-foreground">{t("otp.totpActiveDesc")}</p>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={disableMutation.isPending}
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              {t("otp.disableTotp")}
            </Button>
          </div>
        ) : setupData ? (
          <div className="space-y-5">
            {/* Step 1: Download App */}
            <div className="flex gap-3 items-start p-3 rounded-lg border bg-muted/50">
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">1</div>
              <div className="space-y-1.5">
                <p className="font-medium text-sm">{t("otp.step1Title")}</p>
                <p className="text-xs text-muted-foreground">{t("otp.step1Desc")}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <Smartphone className="h-3 w-3" /> Google Authenticator
                  </a>
                  <a href="https://play.google.com/store/apps/details?id=com.authy.authy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    <Smartphone className="h-3 w-3" /> Authy
                  </a>
                </div>
              </div>
            </div>

            {/* Step 2: Scan QR */}
            <div className="flex gap-3 items-start p-3 rounded-lg border bg-muted/50">
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">2</div>
              <div className="space-y-2 flex-1">
                <p className="font-medium text-sm">{t("otp.step2Title")}</p>
                <p className="text-xs text-muted-foreground">{t("otp.step2Desc")}</p>
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <QRCodeSVG value={setupData.uri} size={180} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("otp.manualEntry")}</p>
                  <code className="block p-2 bg-muted rounded text-xs break-all select-all">
                    {setupData.secret}
                  </code>
                </div>
              </div>
            </div>

            {/* Step 3: Enter Code */}
            <div className="flex gap-3 items-start p-3 rounded-lg border bg-muted/50">
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">3</div>
              <div className="space-y-3 flex-1">
                <p className="font-medium text-sm">{t("otp.step3Title")}</p>
                <p className="text-xs text-muted-foreground">{t("otp.step3Desc")}</p>
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
                  onClick={() => verifySetupMutation.mutate()}
                  disabled={verifyCode.length !== 6 || verifySetupMutation.isPending}
                >
                  {verifySetupMutation.isPending ? t("common.loading") : t("otp.verify")}
                </Button>
              </div>
            </div>

            <Button variant="ghost" className="w-full" onClick={() => setSetupData(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
              <Smartphone className="h-6 w-6 text-muted-foreground" />
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
