import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  const { profile, role } = useAuth();
  const { t, language, setLanguage } = useI18n();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("settings.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.profile")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-xs">{t("auth.fullName")}</Label>
            <p className="font-medium">{profile?.full_name || "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">{t("auth.universityId")}</Label>
            <p className="font-medium">{profile?.university_id || "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">{t("auth.email")}</Label>
            <p className="font-medium">{profile?.email || "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">{t("auth.role")}</Label>
            <p className="font-medium capitalize">{role || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <span className={language === "en" ? "font-medium" : "text-muted-foreground"}>English</span>
            <Switch
              checked={language === "sw"}
              onCheckedChange={(checked) => setLanguage(checked ? "sw" : "en")}
            />
            <span className={language === "sw" ? "font-medium" : "text-muted-foreground"}>Kiswahili</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
