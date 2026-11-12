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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, KeyRound } from "lucide-react";

export interface ResetUser {
  id: string;
  full_name: string;
  email: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ResetUser | null;
}

export default function ResetPasswordDialog({ open, onOpenChange, user }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword(null);
      setCopied(false);
      setSubmitting(false);
    }
  }, [open, user?.id]);

  const reset = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "reset_password", user_id: user.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPassword((data as any).password);
      toast({ title: t("admin.passwordReset"), description: user.email ?? user.full_name });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {t("admin.resetPassword")}
          </DialogTitle>
          <DialogDescription>{t("admin.resetPasswordDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{user?.full_name}</p>
            <p className="text-muted-foreground text-xs">{user?.email ?? "—"}</p>
          </div>

          {password ? (
            <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/40 p-3">
              <Label className="text-xs">{t("admin.newTempPassword")}</Label>
              <div className="flex items-center gap-2">
                <Input value={password} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copy} title={t("admin.copy")}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("auth.passwordPolicyHint")}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("admin.resetPasswordHint")}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {password ? t("common.done") : t("common.cancel")}
          </Button>
          {!password && (
            <Button onClick={reset} disabled={submitting}>
              {submitting ? "…" : t("admin.resetPasswordAction")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
