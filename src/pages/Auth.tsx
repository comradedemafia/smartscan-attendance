import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { QrCode, GraduationCap } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = loginSchema.extend({
  universityId: z.string().min(3, "University ID is required"),
  fullName: z.string().min(2, "Full name is required"),
  role: z.enum(["student", "lecturer"]),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"student" | "lecturer">("student");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, signUp } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);

    try {
      if (isLogin) {
        const parsed = loginSchema.safeParse({ email, password });
        if (!parsed.success) {
          const fieldErrors: Record<string, string> = {};
          parsed.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
          setSubmitting(false);
          return;
        }

        const { error } = await signIn(email, password);
        if (error) {
          toast({ title: t("common.error"), description: error.message, variant: "destructive" });
        } else {
          navigate("/");
        }
      } else {
        const parsed = signupSchema.safeParse({ email, password, universityId, fullName, role });
        if (!parsed.success) {
          const fieldErrors: Record<string, string> = {};
          parsed.error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
          });
          setErrors(fieldErrors);
          setSubmitting(false);
          return;
        }

        const { error } = await signUp(email, password, {
          university_id: universityId,
          full_name: fullName,
          role,
        });
        if (error) {
          toast({ title: t("common.error"), description: error.message, variant: "destructive" });
        } else {
          toast({ title: t("common.success"), description: t("auth.signupSuccess") });
          setIsLogin(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-primary">
            <QrCode className="h-10 w-10" />
            <GraduationCap className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight font-['Space_Grotesk']">
            QR Attendance
          </h1>
          <p className="text-muted-foreground text-center">
            {isLogin ? "Sign in with your university credentials" : "Create your account"}
          </p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle>{isLogin ? t("auth.login") : t("auth.register")}</CardTitle>
            <CardDescription>
              {isLogin ? "Enter your email and password" : "Fill in your details to register"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                    />
                    {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="universityId">{t("auth.universityId")}</Label>
                    <Input
                      id="universityId"
                      value={universityId}
                      onChange={(e) => setUniversityId(e.target.value)}
                      placeholder="STD-2024-001"
                    />
                    {errors.universityId && <p className="text-sm text-destructive">{errors.universityId}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">{t("auth.role")}</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as "student" | "lecturer")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">{t("auth.student")}</SelectItem>
                        <SelectItem value="lecturer">{t("auth.lecturer")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.ac.tz"
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting
                  ? isLogin
                    ? t("auth.signingIn")
                    : t("auth.signingUp")
                  : isLogin
                  ? t("auth.login")
                  : t("auth.register")}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">
                {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
              </span>{" "}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setErrors({}); }}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? t("auth.register") : t("auth.login")}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
