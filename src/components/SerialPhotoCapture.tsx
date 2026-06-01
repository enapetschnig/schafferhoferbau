import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, Check, Image as ImageIcon, Loader2, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

type FitMode = "fit" | "fill";

type ZoomCaps = { min: number; max: number; step: number };

/**
 * Serienaufnahme im Vollbildmodus mit App-interner Kamera (getUserMedia).
 *
 * Features:
 * - 1 Tap pro Foto, Stream bleibt offen.
 * - Vollbild-Vorschau mit object-contain (komplettes Sensor-Frame sichtbar)
 *   plus Toggle auf object-cover ("Fill").
 * - Hardware-Zoom (Chromium-basiert) mit Fallback auf digitalen Zoom
 *   (CSS-Scale + Canvas-Crop) fuer iOS Safari & Firefox.
 * - Pinch-Geste, Slider und Schnellwahl-Pills (1x, 2x, max).
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
  const pinchStateRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const [captured, setCaptured] = useState<CapturedPhoto[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>("fit");
  // Zoom-State
  const [zoom, setZoom] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps | null>(null);
  // Hardware-Zoom-Flag — wird beim Stream-Start ermittelt.
  const [useHardwareZoom, setUseHardwareZoom] = useState(false);

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

      // Hardware-Zoom-Capabilities pruefen (Chromium-only, ~2026).
      const [track] = stream.getVideoTracks();
      // getCapabilities + applyConstraints({ advanced: [{ zoom }] }) sind im
      // TS-DOM-Lib (noch) nicht typisiert — wir greifen ueber Cast zu.
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
        zoom?: { min: number; max: number; step: number };
      };
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        setZoomCaps({
          min: caps.zoom.min,
          max: caps.zoom.max,
          step: caps.zoom.step || 0.1,
        });
        setUseHardwareZoom(true);
        setZoom(caps.zoom.min || 1);
      } else {
        // Fallback: digitaler Zoom 1x..4x (Crop des Canvas-Source bei Aufnahme).
        setZoomCaps({ min: 1, max: 4, step: 0.1 });
        setUseHardwareZoom(false);
        setZoom(1);
      }
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

  // Hardware-Zoom anwenden, sobald zoom oder useHardwareZoom sich aendern.
  useEffect(() => {
    if (!useHardwareZoom || !streamReady) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    // applyConstraints ist async; Fehler -> auf digitalen Zoom zurueckfallen.
    track
      .applyConstraints({
        advanced: [{ zoom } as MediaTrackConstraintSet],
      })
      .catch((err) => {
        console.warn("Hardware-Zoom fehlgeschlagen, fallback auf digital", err);
        setUseHardwareZoom(false);
      });
  }, [zoom, useHardwareZoom, streamReady]);

  // Kamera-Lifecycle an Dialog koppeln
  useEffect(() => {
    if (open) {
      setCaptured([]);
      setFinishing(false);
      setFitMode("fit");
      setZoom(1);
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

    // Bei Hardware-Zoom ist das Video-Frame schon physisch gezoomt → direkt
    // zeichnen. Bei digitalem Zoom: mittiger Source-Crop simuliert den Zoom
    // in der gespeicherten Datei.
    if (useHardwareZoom || zoom === 1) {
      ctx.drawImage(video, 0, 0);
    } else {
      const sWidth = video.videoWidth / zoom;
      const sHeight = video.videoHeight / zoom;
      const sx = (video.videoWidth - sWidth) / 2;
      const sy = (video.videoHeight - sHeight) / 2;
      ctx.drawImage(
        video,
        sx, sy, sWidth, sHeight,
        0, 0, canvas.width, canvas.height,
      );
    }

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

  // ===== Pinch-Geste =====
  const distance = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      pinchStateRef.current = {
        startDist: distance(e.touches[0], e.touches[1]),
        startZoom: zoom,
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !pinchStateRef.current || !zoomCaps) return;
    e.preventDefault();
    const curr = distance(e.touches[0], e.touches[1]);
    const ratio = curr / pinchStateRef.current.startDist;
    const next = pinchStateRef.current.startZoom * ratio;
    const clamped = Math.min(zoomCaps.max, Math.max(zoomCaps.min, next));
    setZoom(Number(clamped.toFixed(2)));
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) pinchStateRef.current = null;
  };

  const setZoomClamped = (value: number) => {
    if (!zoomCaps) return;
    setZoom(Math.min(zoomCaps.max, Math.max(zoomCaps.min, Number(value.toFixed(2)))));
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

        {/* Live-Vorschau — Pinch-Container mit touch-none, damit Browser-
            Default-Pinch nicht greift. */}
        <div
          className="flex-1 relative overflow-hidden bg-black touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 w-full h-full",
              fitMode === "fit" ? "object-contain" : "object-cover",
            )}
            style={
              !useHardwareZoom && zoom > 1
                ? {
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                    transition: "transform 60ms linear",
                  }
                : undefined
            }
          />
          {/* Flash beim Auslösen */}
          {flash && (
            <div className="absolute inset-0 bg-white opacity-60 pointer-events-none" />
          )}
          {/* Hinweis falls Kamera nicht startet */}
          {!streamReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm px-4 text-center">
              Kamera wird gestartet… Falls nichts passiert, prüfe die Kamera-Berechtigung im Browser.
            </div>
          )}

          {/* Fit/Fill-Toggle oben rechts */}
          {streamReady && (
            <button
              type="button"
              onClick={() => setFitMode((m) => (m === "fit" ? "fill" : "fit"))}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
              title={fitMode === "fit" ? "Vorschau füllt den Bildschirm" : "Vorschau auf vollständigen Frame"}
              aria-label="Vorschau-Modus umschalten"
            >
              {fitMode === "fit" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>
          )}

          {/* Zoom-Schnellwahl-Pills unten in der Vorschau (iOS-Style) */}
          {streamReady && zoomCaps && zoomCaps.max > zoomCaps.min && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/50 rounded-full px-2 py-1">
              {[zoomCaps.min, Math.min(2, zoomCaps.max), zoomCaps.max]
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .map((preset) => {
                  const isActive = Math.abs(zoom - preset) < 0.05;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setZoomClamped(preset)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-white text-black"
                          : "text-white/90 hover:bg-white/15",
                      )}
                      aria-label={`Zoom ${preset.toFixed(1)}x`}
                    >
                      {preset.toFixed(preset >= 1 ? 0 : 1)}{preset >= 1 ? "x" : ""}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Zoom-Slider rechts, vertikal */}
          {streamReady && zoomCaps && zoomCaps.max > zoomCaps.min && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 bg-black/40 rounded-full px-1.5 py-2">
              <button
                type="button"
                onClick={() => setZoomClamped(zoom + (zoomCaps.step * 5))}
                className="text-white w-7 h-7 flex items-center justify-center hover:bg-white/15 rounded-full"
                aria-label="Zoom rein"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step}
                value={zoom}
                onChange={(e) => setZoomClamped(Number(e.target.value))}
                className="h-28 w-2 appearance-none accent-white [writing-mode:vertical-lr] [direction:rtl] cursor-pointer"
                aria-label="Zoom"
              />
              <button
                type="button"
                onClick={() => setZoomClamped(zoom - (zoomCaps.step * 5))}
                className="text-white w-7 h-7 flex items-center justify-center hover:bg-white/15 rounded-full"
                aria-label="Zoom raus"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-white text-[10px] font-mono">{zoom.toFixed(1)}x</span>
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
            aria-label="Aus Galerie wählen"
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
