import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type CapturedPhoto = {
  id: string;
  file: File;
  preview: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird beim Abschliessen aufgerufen mit allen aufgenommenen Files */
  onFinish: (files: File[]) => Promise<void> | void;
  title?: string;
}

/**
 * Serienaufnahme im Vollbildmodus mit App-interner Kamera (getUserMedia).
 *
 * Vorteile gegenueber dem alten capture-Input-Pattern:
 * - Stream bleibt offen → 1 Tap pro Foto, kein Kamera-App-Wechsel.
 * - Vollbild-Vorschau (User sieht klar was er fotografiert).
 * - Kein Android-PWA-Killing-Problem.
 */
export function SerialPhotoCapture({
  open,
  onOpenChange,
  onFinish,
  title = "Fotos aufnehmen",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<CapturedPhoto[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [streamReady, setStreamReady] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStreamReady(true);
    } catch (err) {
      console.error("Camera error:", err);
      toast({
        variant: "destructive",
        title: "Kamera-Fehler",
        description: "Zugriff auf Kamera verweigert oder nicht verfuegbar. Du kannst Fotos aus der Galerie wählen.",
      });
      setStreamReady(false);
    }
  }, []);

  // Kamera-Lifecycle an Dialog koppeln
  useEffect(() => {
    if (open) {
      setCaptured([]);
      setFinishing(false);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  // Cleanup Object-URLs beim Unmount der Captured-Liste
  useEffect(() => {
    return () => {
      captured.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || !streamReady) {
      toast({ variant: "destructive", title: "Fehler", description: "Kamera nicht aktiv." });
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast({ variant: "destructive", title: "Fehler", description: "Foto konnte nicht erstellt werden." });
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const timestamp = Date.now();
        const file = new File([blob], `photo_${timestamp}.jpg`, { type: "image/jpeg" });
        const preview = URL.createObjectURL(blob);
        setCaptured((prev) => [...prev, { id: crypto.randomUUID(), file, preview }]);
      },
      "image/jpeg",
      0.9,
    );
    // Kurzer Flash als visuelles Feedback
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
  };

  const removeCaptured = (id: string) => {
    setCaptured((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleGalleryFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setCaptured((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  };

  const finish = async () => {
    if (captured.length === 0) {
      onOpenChange(false);
      return;
    }
    setFinishing(true);
    try {
      await onFinish(captured.map((p) => p.file));
      captured.forEach((p) => URL.revokeObjectURL(p.preview));
      onOpenChange(false);
    } finally {
      setFinishing(false);
    }
  };

  const cancel = () => {
    captured.forEach((p) => URL.revokeObjectURL(p.preview));
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel();
        else onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-full w-screen h-[100dvh] p-0 m-0 border-0 rounded-none bg-black flex flex-col gap-0 sm:max-w-full"
        // Vollbild-Layout: Header + Live-Vorschau + Galerie + Aus loeser.
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-black/90 text-white shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            disabled={finishing}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5 mr-1" />
            Abbrechen
          </Button>
          <span className="text-sm font-medium">
            {title}
            {captured.length > 0 ? ` · ${captured.length}` : ""}
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={finish}
            disabled={finishing || captured.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {finishing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Lädt…
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" />
                Fertig{captured.length > 0 ? ` (${captured.length})` : ""}
              </>
            )}
          </Button>
        </div>

        {/* Live-Vorschau */}
        <div className="flex-1 relative overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Flash beim Aus loesen */}
          {flash && (
            <div className="absolute inset-0 bg-white opacity-60 pointer-events-none" />
          )}
          {/* Wenn Kamera nicht startet: Hinweis */}
          {!streamReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm px-4 text-center">
              Kamera wird gestartet… Falls nichts passiert, prüfe die Kamera-Berechtigung im Browser.
            </div>
          )}
        </div>

        {/* Mini-Galerie der bisher aufgenommenen Fotos */}
        {captured.length > 0 && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto bg-black/90 shrink-0">
            {captured.map((p) => (
              <div key={p.id} className="relative shrink-0">
                <img
                  src={p.preview}
                  alt=""
                  className="h-16 w-16 object-cover rounded border border-white/30"
                />
                <button
                  type="button"
                  onClick={() => removeCaptured(p.id)}
                  className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700"
                  title="Entfernen"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Auslöser-Leiste */}
        <div className="flex items-center justify-between px-6 py-4 bg-black shrink-0">
          {/* Galerie-Fallback links */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={finishing}
            className="h-12 w-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            title="Aus Galerie wählen"
          >
            <ImageIcon className="h-6 w-6" />
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGalleryFiles}
          />

          {/* Großer Auslöser-Button */}
          <button
            type="button"
            onClick={capturePhoto}
            disabled={!streamReady || finishing}
            className="h-20 w-20 rounded-full bg-white border-4 border-white/40 active:scale-95 transition-transform disabled:opacity-50"
            title="Foto aufnehmen"
            aria-label="Foto aufnehmen"
          />

          {/* Platzhalter rechts für visuelle Symmetrie */}
          <div className="h-12 w-12 flex items-center justify-center text-white/60">
            <Camera className="h-5 w-5" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
