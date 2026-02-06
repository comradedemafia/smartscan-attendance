import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function Reports() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("reports.title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            {t("reports.trend")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">—</p>
        </CardContent>
      </Card>
    </div>
  );
}
