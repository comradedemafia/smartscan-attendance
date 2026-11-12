import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Send, Bell } from "lucide-react";

type TargetRole = "student" | "lecturer" | "admin" | "all";

export default function SendNotification() {
  const { role } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState<TargetRole>("student");
  const [notifType, setNotifType] = useState("info");

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (targetRole === "all") {
        // Send to all roles
        for (const r of ["student", "lecturer", "admin"] as const) {
          const { error } = await supabase.rpc("notify_users_by_role", {
            _role: r,
            _title: title,
            _message: message,
            _type: notifType,
          });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.rpc("notify_users_by_role", {
          _role: targetRole,
          _title: title,
          _message: message,
          _type: notifType,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t("notify.sent") });
      setTitle("");
      setMessage("");
      setOpen(false);
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  if (role !== "admin" && role !== "lecturer") return null;

  const canSend = title.trim() && message.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{t("notify.sendNotification")}</p>
              <p className="text-xs text-muted-foreground">{t("notify.sendDesc")}</p>
            </div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t("notify.sendNotification")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t("notify.targetRole")}</Label>
            <Select value={targetRole} onValueChange={(v) => setTargetRole(v as TargetRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">{t("auth.student")}</SelectItem>
                <SelectItem value="lecturer">{t("auth.lecturer")}</SelectItem>
                {role === "admin" && <SelectItem value="admin">{t("common.admin")}</SelectItem>}
                <SelectItem value="all">{t("notify.allUsers")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("notify.type")}</Label>
            <Select value={notifType} onValueChange={setNotifType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">{t("notify.typeInfo")}</SelectItem>
                <SelectItem value="session">{t("notify.typeSession")}</SelectItem>
                <SelectItem value="qr">{t("notify.typeQr")}</SelectItem>
                <SelectItem value="alert">{t("notify.typeAlert")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("notify.notifTitle")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("notify.titlePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("notify.notifMessage")}</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("notify.messagePlaceholder")}
              rows={3}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {sendMutation.isPending ? t("common.loading") : t("notify.send")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
