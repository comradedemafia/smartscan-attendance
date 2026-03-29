import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, ShieldOff, Copy, RefreshCw } from "lucide-react";

export default function TotpSetup() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Setup mutation — just generates secret, no QR needed
  const setupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "setup-totp" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["totp-status"] });
      toast({ title: t("common.success"), description: t("otp.totpEnabled") });
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
      toast({ title: t("common.success"), description: t("otp.totpDisabled") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
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
        {hasTotp ? (
          <div className="space-y-4">
            {/* Live TOTP code display */}
            <TotpCodeDisplay />
            <Button
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={disableMutation.isPending}
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              {t("otp.disableTotp")}
            </Button>
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

/** Shows live TOTP code that refreshes every 30 seconds */
function TotpCodeDisplay() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [loading, setLoading] = useState(false);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("attendance-otp", {
        body: { action: "get-totp-code" },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setCode(data.code);
      setSecondsLeft(data.seconds_remaining);
    } catch {
      setCode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCode();
    const interval = setInterval(fetchCode, 30_000);
    return () => clearInterval(interval);
  }, [fetchCode]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchCode();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchCode]);

  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      toast({ title: t("otp.codeCopied") });
    }
  };

  const progressPercent = (secondsLeft / 30) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 text-primary">
        <ShieldCheck className="h-5 w-5" />
        <div>
          <p className="font-medium text-sm">{t("otp.totpActive")}</p>
          <p className="text-xs text-muted-foreground">{t("otp.totpActiveCodeDesc")}</p>
        </div>
      </div>

      {/* Code display */}
      <div className="rounded-xl border-2 border-primary/20 bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("otp.verificationCode")}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${secondsLeft <= 5 ? "animate-spin text-destructive" : ""}`} />
            <span className={secondsLeft <= 5 ? "text-destructive font-bold" : ""}>{secondsLeft}s</span>
          </div>
        </div>

        {code ? (
          <div className="flex justify-center gap-2">
            {code.split("").map((digit, i) => (
              <div
                key={i}
                className="flex items-center justify-center w-11 h-14 rounded-lg bg-primary/10 border border-primary/20 text-2xl font-bold text-primary font-mono"
              >
                {digit}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <span className="text-muted-foreground text-sm">{loading ? t("common.loading") : "---"}</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={copyCode} disabled={!code}>
          <Copy className="h-3.5 w-3.5 mr-2" />
          {t("otp.copyCode")}
        </Button>
      </div>
    </div>
  );
}
