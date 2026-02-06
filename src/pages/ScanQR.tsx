import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QrCode } from "lucide-react";

export default function ScanQR() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">{t("qr.scan")}</h1>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <QrCode className="h-5 w-5" />
            {t("qr.scan")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">{t("qr.scanning")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
