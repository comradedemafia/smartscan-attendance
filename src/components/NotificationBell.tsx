import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Check, Calendar, QrCode, Trash2, AlertTriangle, Info } from "lucide-react";
import { formatRelativeTime } from "@/lib/dates";

export default function NotificationBell() {
  const { user } = useAuth();
  const { t, localeCode } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Realtime subscription for instant notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('student-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
    },
  });

  const typeIcon = (type: string) => {
    switch (type) {
      case "session": return <Calendar className="h-4 w-4 text-primary" />;
      case "qr": return <QrCode className="h-4 w-4 text-primary" />;
      case "alert": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "session": return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("notifications.session")}</Badge>;
      case "qr": return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t("notifications.qr")}</Badge>;
      case "alert": return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t("notifications.alert")}</Badge>;
      default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t("notifications.info")}</Badge>;
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && unreadCount > 0) markReadMutation.mutate(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <button
            onClick={() => { setOpen(false); navigate("/notifications"); }}
            className="font-semibold text-sm hover:text-primary transition-colors"
          >
            {t("notify.history")}
          </button>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Badge variant="default" className="text-[10px] px-1.5">
                {unreadCount} {t("notify.unread")}
              </Badge>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => clearMutation.mutate()}>
                <Trash2 className="h-3 w-3 mr-1" />{t("notify.clearAll")}
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-10 w-10 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground">{t("notify.noNotifications")}</p>
            </div>
          ) : (
            notifications.map((n: any) => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-border last:border-0 flex gap-3 transition-colors ${!n.is_read ? "bg-primary/5" : "hover:bg-muted/50"}`}
              >
                <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {typeBadge(n.type)}
                    {!n.is_read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(n.created_at, localeCode)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(n.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary hover:text-primary"
              onClick={() => { setOpen(false); navigate("/notifications"); }}
            >
              {t("notify.viewAll")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
