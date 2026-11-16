import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import LanguageToggle from "@/components/LanguageToggle";
import { ShieldCheck } from "lucide-react";

const POLICY = {
  test: (p: string) =>
    p.length >= 12 &&
    /[A-Z]/.test(p) &&
    /[a-z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^A-Za-z0-9]/.test(p),
};

export default function MustChangePassword() {
  const { signOut } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!POLICY.test(pwd)) {
      setErr(t("auth.passwordPolicyHint"));
      return;
    }
    if (pwd !== confirm) {
      setErr(t("auth.passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const { error: fnError } = await supabase.functions.invoke(
        "complete-password-change",
        { body: { password: pwd } },
      );

      if (fnError) {
        let code = "";
        const context = (fnError as { context?: Response }).context;
        if (context) {
          try {
            const body = await context.json();
            if (typeof body?.error === "string") code = body.error;
          } catch {
            // Ignore non-JSON error bodies.
          }
        }

        if (code === "password_policy") throw new Error(t("auth.passwordPolicyHint"));
        if (code === "not_required") throw new Error(t("auth.passwordChangeNotRequired"));
        if (code === "unauthorized") throw new Error(t("sessions.endedExpired"));
        throw new Error(t("auth.passwordChangeFailed"));
      }

      toast({ title: t("common.success"), description: t("auth.passwordUpdated") });
      await signOut();
      navigate("/auth", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4">
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-primary">
          <ShieldCheck className="h-10 w-10" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.mustChangePasswordTitle")}</CardTitle>
            <CardDescription>{t("auth.mustChangePasswordDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handle} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("auth.newPassword")}</Label>
                <Input
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("auth.confirmPassword")}</Label>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("auth.passwordPolicyHint")}</p>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "…" : t("auth.updatePassword")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}