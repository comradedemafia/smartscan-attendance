import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Camera,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  FACE_MATCH_THRESHOLD,
  loadFaceVerificationModels,
  verifySelfieAgainstAvatar,
  type SelfieVerificationPayload,
} from "@/lib/faceVerification";

interface SelfieCaptureProps {
  avatarUrl: string | null | undefined;
  profileGender: string | null | undefined;
  requireVerification?: boolean;
  onVerified: (payload: SelfieVerificationPayload) => void;
  onCancel: () => void;
}

type CameraState = "starting" | "ready" | "error";
type ModelState = "loading" | "ready" | "error";

export default function SelfieCapture({
  avatarUrl,
  profileGender,
  requireVerification = true,
  onVerified,
  onCancel,
}: SelfieCaptureProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [modelState, setModelState] = useState<ModelState>("loading");
  const [modelAttempt, setModelAttempt] = useState(0);
  const [captured, setCaptured] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCaptured(null);
    capturedCanvasRef.current = null;
    setCameraState("starting");
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("ready");
    } catch {
      setCameraState("error");
      setError(t("selfie.cameraError"));
    }
  }, [stopCamera, t]);

  useEffect(() => {
    if (requireVerification && !avatarUrl) return;
    void startCamera();
    return stopCamera;
  }, [avatarUrl, requireVerification, startCamera, stopCamera]);

  useEffect(() => {
    if (!requireVerification) {
      setModelState("ready");
      return;
    }

    let cancelled = false;
    setModelState("loading");
    loadFaceVerificationModels()
      .then(() => {
        if (!cancelled) setModelState("ready");
      })
      .catch(() => {
        if (!cancelled) setModelState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [requireVerification, modelAttempt]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    if (!size) return;

    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) return;

    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    context.drawImage(video, sx, sy, size, size, 0, 0, canvas.width, canvas.height);

    capturedCanvasRef.current = canvas;
    setCaptured(canvas.toDataURL("image/jpeg", 0.82));
    stopCamera();
  }, [stopCamera]);

  const handleVerify = useCallback(async () => {
    const canvas = capturedCanvasRef.current;
    if (!canvas) return;

    if (!requireVerification) {
      onVerified({
        dataUrl: canvas.toDataURL("image/jpeg", 0.82),
        faceDetected: true,
        faceMatchDistance: null,
        gender: null,
        genderProbability: null,
        genderMatch: null,
      });
      return;
    }

    if (!avatarUrl) {
      setError(t("selfie.noAvatar"));
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const result = await verifySelfieAgainstAvatar(avatarUrl, canvas, profileGender);

      if (!result.faceDetected) {
        setError(t("selfie.noFace"));
        return;
      }
      if (
        result.faceMatchDistance == null ||
        result.faceMatchDistance > FACE_MATCH_THRESHOLD
      ) {
        setError(t("selfie.faceMismatch"));
        return;
      }
      if (result.genderMatch === false) {
        setError(t("selfie.genderMismatch"));
        return;
      }

      onVerified({
        ...result,
        dataUrl: canvas.toDataURL("image/jpeg", 0.82),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "MULTIPLE_FACES") setError(t("selfie.multipleFaces"));
      else if (code === "AVATAR_MISSING") setError(t("selfie.noAvatar"));
      else if (code === "AVATAR_FACE_NOT_FOUND") setError(t("selfie.avatarFaceNotFound"));
      else if (code === "IMAGE_LOAD_FAILED") setError(t("selfie.avatarLoadError"));
      else setError(t("selfie.verifyError"));
    } finally {
      setVerifying(false);
    }
  }, [avatarUrl, onVerified, profileGender, requireVerification, t]);

  if (requireVerification && !avatarUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <p className="font-medium">{t("selfie.noAvatar")}</p>
            <p className="text-sm opacity-90">{t("selfie.noAvatarDesc")}</p>
          </div>
        </div>
        <Button asChild className="w-full" size="lg">
          <Link to="/settings">
            <UserCheck className="mr-2 h-4 w-4" />
            {t("selfie.goToSettings")}
          </Link>
        </Button>
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg bg-primary/10 p-4 text-primary">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0" />
        <div>
          <p className="font-medium">{t("selfie.title")}</p>
          <p className="text-sm text-muted-foreground">{t("selfie.desc")}</p>
        </div>
      </div>

      {requireVerification && modelState === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("selfie.loadingModels")}
        </div>
      )}

      {requireVerification && modelState === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium">{t("selfie.modelError")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setModelAttempt((attempt) => attempt + 1)}
            >
              {t("common.retry")}
            </Button>
          </div>
        </div>
      )}

      {requireVerification && !profileGender && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("selfie.genderMissing")}
        </div>
      )}

      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn(
            "h-full w-full scale-x-[-1] object-cover",
            (captured || cameraState !== "ready") && "invisible",
          )}
        />
        {captured && (
          <img
            src={captured}
            alt={t("selfie.title")}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!captured && cameraState === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-3/4 w-3/4 rounded-full border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        )}
        {!captured && cameraState === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!captured ? (
        <Button
          className="w-full"
          size="lg"
          onClick={capture}
          disabled={cameraState !== "ready"}
        >
          <Camera className="mr-2 h-4 w-4" />
          {t("selfie.capture")}
        </Button>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full"
            size="lg"
            onClick={handleVerify}
            disabled={
              verifying ||
              (requireVerification && modelState !== "ready")
            }
          >
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("selfie.verifying")}
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {requireVerification ? t("selfie.verify") : t("common.continue")}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={startCamera}
            disabled={verifying}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("selfie.retake")}
          </Button>
        </div>
      )}

      {!requireVerification && (
        <p className="text-center text-xs text-muted-foreground">
          {t("selfie.offlineNote")}
        </p>
      )}

      <Button variant="ghost" className="w-full" onClick={onCancel} disabled={verifying}>
        {t("common.cancel")}
      </Button>
    </div>
  );
}
