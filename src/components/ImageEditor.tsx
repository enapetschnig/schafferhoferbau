import { useRef, useState, useEffect, useCallback } from "react";
import { ReactSketchCanvas, ReactSketchCanvasRef } from "react-sketch-canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Undo2, Redo2, Eraser, Trash2, Send, Pencil, X, AlertCircle, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  onSave: (editedBlob: Blob) => Promise<void>;
  /** Optional: wenn gesetzt, erscheint zusaetzlich ein "Im Chat posten"-Button */
  onShareToChat?: (editedBlob: Blob) => Promise<void>;
  title?: string;
}

const COLORS = [
  { value: "#ef4444", label: "Rot" },
  { value: "#22c55e", label: "Grün" },
  { value: "#3b82f6", label: "Blau" },
  { value: "#eab308", label: "Gelb" },
  { value: "#000000", label: "Schwarz" },
  { value: "#ffffff", label: "Weiß" },
];

const STROKE_WIDTHS = [
  { value: 3, label: "S" },
  { value: 6, label: "M" },
  { value: 12, label: "L" },
];

export function ImageEditor({ open, onClose, imageUrl, onSave, onShareToChat, title = "Bild bearbeiten" }: Props) {
  const { toast } = useToast();
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokeColor, setStrokeColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Bild laden: Fetch als Blob (umgeht CORS-Issues) + Data-URL erstellen
  // Dadurch hat das Image-Element ein "safe" image, nicht tainted fürs Canvas
  const loadImage = useCallback(async () => {
    if (!imageUrl) return;
    setImageReady(false);
    setImageError(false);
    setImageDataUrl(null);

    try {
      let dataUrl: string;

      // Wenn schon eine Data-URL, direkt verwenden
      if (imageUrl.startsWith("data:")) {
        dataUrl = imageUrl;
      } else {
        // Fetch das Bild als Blob (CORS muss erlaubt sein, bei Supabase via access-control-allow-origin: *)
        const response = await fetch(imageUrl, { mode: "cors" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();

        // Sicherheit: Max 20MB
        if (blob.size > 20 * 1024 * 1024) {
          throw new Error("Bild ist zu groß (max 20MB)");
        }

        // Als Data-URL konvertieren - Canvas ist dann nicht tainted
        const reader = new FileReader();
        dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      setImageDataUrl(dataUrl);

      // Bild laden um Groesse zu ermitteln
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = dataUrl;
      });

      setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight });

      // Canvas-Groesse berechnen (fit to viewport)
      const maxWidth = Math.min(window.innerWidth - 40, 1200);
      const maxHeight = window.innerHeight - 220;

      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const ratio = w / h;

      if (w > maxWidth) { w = maxWidth; h = w / ratio; }
      if (h > maxHeight) { h = maxHeight; w = h * ratio; }

      setCanvasSize({ width: Math.round(w), height: Math.round(h) });
      setImageReady(true);
    } catch (err) {
      console.error("ImageEditor: Fehler beim Laden des Bildes", err);
      setImageError(true);
      setImageReady(true);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (open && imageUrl) loadImage();
  }, [open, imageUrl, loadImage]);

  // Cleanup bei Close
  useEffect(() => {
    if (!open) {
      setImageReady(false);
      setImageError(false);
      setImageDataUrl(null);
      setSaving(false);
      setIsEraser(false);
    }
  }, [open]);

  // Radiergummi Mode
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.eraseMode(isEraser);
    }
  }, [isEraser]);

  // Resize bei Fenster-Aenderung
  useEffect(() => {
    if (!open || !imageReady) return;
    const handleResize = () => {
      if (originalSize.width === 0) return;
      const maxWidth = Math.min(window.innerWidth - 40, 1200);
      const maxHeight = window.innerHeight - 220;
      let w = originalSize.width;
      let h = originalSize.height;
      const ratio = w / h;
      if (w > maxWidth) { w = maxWidth; h = w / ratio; }
      if (h > maxHeight) { h = maxHeight; w = h * ratio; }
      setCanvasSize({ width: Math.round(w), height: Math.round(h) });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, imageReady, originalSize]);

  const handleUndo = () => canvasRef.current?.undo();
  const handleRedo = () => canvasRef.current?.redo();
  const handleClear = () => {
    if (confirm("Alle Anmerkungen entfernen?")) {
      canvasRef.current?.resetCanvas();
    }
  };

  const produceBlob = async (): Promise<Blob> => {
    if (!canvasRef.current || !imageDataUrl || originalSize.width === 0) {
      throw new Error("Bild ist noch nicht bereit");
    }
    // 1. Canvas-Anmerkungen als Data-URL
    const drawingDataUrl = await canvasRef.current.exportImage("png");
    // 2. Original + Zeichnung mergen
    const MAX_OUTPUT = 3000;
    let outW = originalSize.width;
    let outH = originalSize.height;
    if (outW > MAX_OUTPUT || outH > MAX_OUTPUT) {
      const ratio = outW / outH;
      if (outW > outH) { outW = MAX_OUTPUT; outH = Math.round(outW / ratio); }
      else { outH = MAX_OUTPUT; outW = Math.round(outH * ratio); }
    }
    const mergeCanvas = document.createElement("canvas");
    mergeCanvas.width = outW;
    mergeCanvas.height = outH;
    const ctx = mergeCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas-Kontext nicht verfügbar");
    const originalImg = new Image();
    await new Promise<void>((resolve, reject) => {
      originalImg.onload = () => resolve();
      originalImg.onerror = () => reject(new Error("Original-Bild konnte nicht geladen werden"));
      originalImg.src = imageDataUrl;
    });
    ctx.drawImage(originalImg, 0, 0, outW, outH);
    const drawingImg = new Image();
    await new Promise<void>((resolve, reject) => {
      drawingImg.onload = () => resolve();
      drawingImg.onerror = () => reject(new Error("Zeichnung konnte nicht geladen werden"));
      drawingImg.src = drawingDataUrl;
    });
    ctx.drawImage(drawingImg, 0, 0, outW, outH);
    return new Promise<Blob>((resolve, reject) => {
      mergeCanvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error("Blob konnte nicht erstellt werden")),
        "image/jpeg",
        0.92
      );
    });
  };

  const handleShareToChat = async () => {
    if (!onShareToChat) return;
    setSaving(true);
    try {
      const blob = await produceBlob();
      await onShareToChat(blob);
    } catch (err: any) {
      console.error("ImageEditor share to chat error:", err);
      toast({
        variant: "destructive",
        title: "Fehler beim Senden in den Chat",
        description: err?.message || "Bild konnte nicht gesendet werden",
      });
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await produceBlob();
      await onSave(blob);
      // onSave schliesst normalerweise den Dialog via onClose im Parent
    } catch (err: any) {
      console.error("ImageEditor save error:", err);
      toast({
        variant: "destructive",
        title: "Fehler beim Speichern",
        description: err?.message || "Bild konnte nicht gespeichert werden",
      });
      setSaving(false);
    }
  };

  // Dialog nicht schliessen während Speichern läuft
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && saving) return;
    if (!newOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-5xl p-0 flex flex-col gap-0 h-[95vh] overflow-hidden"
        onPointerDownOutside={(e) => saving && e.preventDefault()}
        onEscapeKeyDown={(e) => saving && e.preventDefault()}
      >
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" />
            {title}
          </DialogTitle>
          <button
            onClick={() => { if (!saving) onClose(); }}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-3 py-2 border-b bg-muted/30 flex flex-wrap items-center gap-2">
          {/* Farben */}
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all",
                  strokeColor === c.value && !isEraser
                    ? "border-gray-900 dark:border-white scale-110 ring-2 ring-offset-1"
                    : "border-gray-300 hover:scale-105"
                )}
                style={{ backgroundColor: c.value }}
                onClick={() => { setStrokeColor(c.value); setIsEraser(false); }}
                title={c.label}
                disabled={saving}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Strichstärke */}
          <div className="flex gap-1">
            {STROKE_WIDTHS.map((s) => (
              <Button
                key={s.value}
                variant={strokeWidth === s.value ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setStrokeWidth(s.value)}
                disabled={saving}
              >
                {s.label}
              </Button>
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Radiergummi */}
          <Button
            variant={isEraser ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEraser(!isEraser)}
            title="Radiergummi"
            disabled={saving}
          >
            <Eraser className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Undo/Redo */}
          <Button variant="outline" size="sm" onClick={handleUndo} title="Rückgängig" disabled={saving}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleRedo} title="Wiederherstellen" disabled={saving}>
            <Redo2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Zurücksetzen */}
          <Button variant="outline" size="sm" onClick={handleClear} title="Alles löschen" className="text-destructive" disabled={saving}>
            <Trash2 className="h-4 w-4" />
          </Button>

          <div className="flex-1" />

          {/* Im Chat posten (nur wenn Handler da) */}
          {onShareToChat && (
            <Button
              onClick={handleShareToChat}
              disabled={saving || !imageReady || imageError}
              size="sm"
              variant="outline"
              className="gap-1"
              title="Bearbeitetes Bild direkt in den Projekt-Chat posten"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">In Chat</span>
            </Button>
          )}

          {/* Speichern */}
          <Button onClick={handleSave} disabled={saving || !imageReady || imageError} size="sm" className="gap-1">
            <Send className="h-4 w-4" />
            {saving ? "Speichert..." : "Speichern"}
          </Button>
        </div>

        {/* Canvas-Bereich */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-auto bg-gray-100 dark:bg-gray-900 p-4"
          style={{ touchAction: "none" }}
        >
          {imageError ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm">Bild konnte nicht geladen werden</p>
              <p className="text-xs">Bitte Dialog schließen und erneut versuchen</p>
            </div>
          ) : !imageReady ? (
            <p className="text-muted-foreground">Bild wird geladen...</p>
          ) : (
            <div
              className="relative shadow-lg select-none"
              style={{ width: canvasSize.width, height: canvasSize.height }}
            >
              {/* Hintergrundbild (aus Data-URL fürs CORS-freie Rendering) */}
              {imageDataUrl && (
                <img
                  src={imageDataUrl}
                  alt="Zu bearbeitendes Bild"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              )}
              {/* Canvas darüber */}
              <ReactSketchCanvas
                ref={canvasRef}
                width={`${canvasSize.width}px`}
                height={`${canvasSize.height}px`}
                strokeWidth={strokeWidth}
                eraserWidth={strokeWidth * 2}
                strokeColor={strokeColor}
                canvasColor="transparent"
                style={{ border: "none", position: "relative", zIndex: 10, touchAction: "none" }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
