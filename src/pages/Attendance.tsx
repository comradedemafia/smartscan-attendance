import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function Attendance() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("attendance.title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5" />
            {t("attendance.history")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">—</p>
        </CardContent>
      </Card>
    </div>
  );
}
