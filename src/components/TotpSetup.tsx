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
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("otp.scanQrWithApp")}</p>
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <QRCodeSVG value={setupData.uri} size={200} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("otp.manualEntry")}</p>
              <code className="block p-2 bg-muted rounded text-xs break-all select-all">
                {setupData.secret}
              </code>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("otp.enterVerificationCode")}</p>
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
