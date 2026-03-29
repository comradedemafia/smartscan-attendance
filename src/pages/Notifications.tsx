import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Bell, Calendar, QrCode, Check, Trash2, AlertTriangle, Info } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["all-notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-notifications"] }),
  });

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const typeIcon = (type: string) => {
    switch (type) {
      case "session": return <Calendar className="h-5 w-5 text-primary" />;
      case "qr": return <QrCode className="h-5 w-5 text-primary" />;
      case "alert": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default: return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "session": return <Badge variant="secondary" className="text-[10px]">Session</Badge>;
      case "qr": return <Badge variant="secondary" className="text-[10px]">QR</Badge>;
      case "alert": return <Badge variant="destructive" className="text-[10px]">Alert</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">Info</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-['Space_Grotesk']">
            {t("notify.history")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {notifications.length} {t("notify.total")} • {unreadCount} {t("notify.unread")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t("notify.markAllRead")}
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-destructive"
              onClick={() => setConfirmClearAll(true)}
              disabled={clearAllMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {t("notify.clearAll")}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{t("common.loading")}</div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">{t("notify.noNotifications")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <Card
              key={n.id}
              className={`transition-all ${!n.is_read ? "border-primary/30 bg-primary/5" : ""}`}
            >
              <CardContent className="p-4 flex gap-4">
                <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {typeBadge(n.type)}
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground/60">
                    {format(new Date(n.created_at), "PPp")} •{" "}
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDeleteId(n.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClearAll}
        onOpenChange={setConfirmClearAll}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmClearNotifications")}
        onConfirm={() => {
          clearAllMutation.mutate();
          setConfirmClearAll(false);
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title={t("common.confirmDeleteTitle")}
        description={t("common.confirmDeleteNotification")}
        onConfirm={() => {
          if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
