import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "pointerdown",
  "wheel",
] as const;

export default function SessionGuard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const timeoutRef = useRef<number | null>(null);
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (!user) {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      signingOutRef.current = false;
      return;
    }

    lastActivityRef.current = Date.now();

    const logout = async () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      await signOut();
      navigate("/auth", { replace: true });
    };

    const schedule = () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current);
      if (remaining <= 0) {
        void logout();
        return;
      }
      timeoutRef.current = window.setTimeout(() => {
        if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
          void logout();
        } else {
          schedule();
        }
      }, remaining);
    };

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        void logout();
      } else {
        schedule();
      }
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity),
      );
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [navigate, signOut, user]);

  return null;
}
