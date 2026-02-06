import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function UsersAdmin() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("nav.users")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            {t("nav.users")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">—</p>
        </CardContent>
      </Card>
    </div>
  );
}
