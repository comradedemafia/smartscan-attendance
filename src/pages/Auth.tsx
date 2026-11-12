import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import LanguageToggle from "@/components/LanguageToggle";
import { QrCode, GraduationCap } from "lucide-react";
import { z } from "zod";

export default function Auth() {
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();

  const loginSchema = useMemo(
    () =>
      z.object({
        loginId: z.string().min(3, t("auth.loginIdRequired")),
        password: z.string().min(6, t("common.passwordMin6")),
      }),
    [t],
  );

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = z.object({ email: z.string().email(t("auth.invalidEmail")) }).safeParse({ email });
    if (!parsed.success) {
      setErrors({ email: parsed.error.errors[0].message });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        toast({ title: t("common.success"), description: t("auth.resetLinkSent") });
        setIsForgotPassword(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = loginSchema.safeParse({ loginId, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      let emailToUse = loginId.trim();
      if (!emailToUse.includes("@")) {
        const { data: resolved } = await supabase.rpc("email_for_login_id", {
          _login_id: emailToUse,
        });
        if (!resolved) {
          toast({ title: t("common.error"), description: t("common.accountNotFound"), variant: "destructive" });
          return;
        }
        emailToUse = resolved as string;
      }

      const { error } = await signIn(emailToUse, password);
      if (error) {
        toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      } else {
        navigate("/");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isForgotPassword) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background p-4">
        <LanguageToggle className="absolute top-4 right-4" />
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-primary">
              <QrCode className="h-10 w-10" />
              <GraduationCap className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-['Space_Grotesk']">{t("app.name")}</h1>
          </div>
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle>{t("auth.resetPassword")}</CardTitle>
              <CardDescription>{t("common.resetEmailDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
                </Button>
              </form>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setErrors({});
                  }}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  {t("auth.backToLogin")}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4">
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-primary">
            <QrCode className="h-10 w-10" />
            <GraduationCap className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight font-['Space_Grotesk']">{t("app.name")}</h1>
          <p className="text-muted-foreground text-center">{t("auth.signInSubtitle")}</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle>{t("auth.login")}</CardTitle>
            <CardDescription>{t("auth.loginCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loginId">{t("auth.loginIdLabel")}</Label>
                <Input
                  id="loginId"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder={t("auth.loginIdPlaceholder")}
                  autoComplete="username"
                />
                {errors.loginId && <p className="text-sm text-destructive">{errors.loginId}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setErrors({});
                  }}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  {t("auth.forgotPassword")}
                </button>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("auth.signingIn") : t("auth.login")}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">{t("auth.managedAccountsNotice")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
