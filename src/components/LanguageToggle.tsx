import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";

interface LanguageToggleProps {
  className?: string;
}

/**
 * Compact EN/SW switch used on pages outside the main app shell
 * (auth, password reset, change-password, 404). The authenticated shell has
 * its own switch in the sidebar.
 */
export default function LanguageToggle({ className }: LanguageToggleProps) {
  const { t, language, setLanguage } = useI18n();
  const next = language === "en" ? "sw" : "en";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => setLanguage(next)}
      aria-label={
        language === "en" ? t("language.switchToSwahili") : t("language.switchToEnglish")
      }
    >
      <Languages className="h-4 w-4 mr-2" />
      {language === "en" ? t("settings.english") : t("settings.swahili")}
    </Button>
  );
}
