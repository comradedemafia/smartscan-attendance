import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function Sessions() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("sessions.title")}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            {t("sessions.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("dashboard.noSessions")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
