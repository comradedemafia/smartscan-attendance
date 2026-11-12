import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldOff } from "lucide-react";
import type { ResetUser } from "@/components/ResetPasswordDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ResetUser | null;
}

export default function ResetTotpDialog({ open, onOpenChange, user }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setDone(false);
    }
  }, [open, user?.id]);

  const reset = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "reset_totp", user_id: user.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDone(true);
      toast({ title: t("admin.resetTotpSuccess"), description: user.full_name });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-primary" />
            {t("admin.resetTotp")}
          </DialogTitle>
          <DialogDescription>{t("admin.resetTotpDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{user?.full_name}</p>
            <p className="text-muted-foreground text-xs">{user?.email ?? "—"}</p>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("admin.resetTotpHint")}</span>
          </div>
          {done && <p className="text-sm text-primary">{t("admin.resetTotpDone")}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {done ? t("common.done") : t("common.cancel")}
          </Button>
          {!done && (
            <Button onClick={reset} disabled={submitting}>
              {submitting ? "…" : t("admin.resetTotpAction")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
