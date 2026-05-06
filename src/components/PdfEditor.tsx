import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Eraser, Undo2, Redo2, Trash2, X, Save, Loader2, Copy } from "lucide-react";
import { ReactSketchCanvas, type ReactSketchCanvasRef } from "react-sketch-canvas";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Props {
  open: boolean;
  onClose: () => void;
  /** URL zur Original-PDF (signed oder public). Wird auch fuer den Save-Vorgang erneut geladen. */
  pdfUrl: string;
  fileName: string;
  /** Wird mit dem produzierten Blob aufgerufen. Mode steuert ob Original ueberschrieben oder als Kopie gespeichert wird. */
  onSave: (blob: Blob, mode: "replace" | "copy") => Promise<void>;
}

const COLORS = [
  { name: "Rot", value: "#ef4444" },
  { name: "Schwarz", value: "#0f172a" },
  { name: "Blau", value: "#2563eb" },
  { name: "Gruen", value: "#16a34a" },
  { name: "Gelb", value: "#fbbf24" },
];

type RenderedPage = {
  pageIndex: number;
  width: number;   // CSS-Pixel
  height: number;  // CSS-Pixel
  imgDataUrl: string; // gerendertes PDF-Page als PNG
  ref: React.RefObject<ReactSketchCanvasRef>;
};

export function PdfEditor({ open, onClose, pdfUrl, fileName, onSave }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [strokeColor, setStrokeColor] = useState<string>(COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [eraserMode, setEraserMode] = useState<boolean>(false);
  const [saving, setSaving] = useState<"idle" | "replace" | "copy">("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setPages([]);

    (async () => {
      try {
        const resp = await fetch(pdfUrl);
        if (!resp.ok) throw new Error(`PDF konnte nicht geladen werden (${resp.status})`);
        const buf = await resp.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const newPages: RenderedPage[] = [];
        // Jede Seite mit Renderskala 1.5 fuer scharfe Anzeige
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          newPages.push({
            pageIndex: i - 1,
            width: viewport.width,
            height: viewport.height,
            imgDataUrl: canvas.toDataURL("image/png"),
            ref: { current: null } as React.RefObject<ReactSketchCanvasRef>,
          });
        }
        if (!cancelled) {
          setPages(newPages);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("PdfEditor: Fehler beim Laden", err);
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "PDF konnte nicht geladen werden",
            description: err?.message || "Bitte erneut versuchen",
          });
          setLoading(false);
          onClose();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [open, pdfUrl, toast, onClose]);

  const handleUndo = () => {
    pages.forEach((p) => p.ref.current?.undo());
  };
  const handleRedo = () => {
    pages.forEach((p) => p.ref.current?.redo());
  };
  const handleClearAll = () => {
    if (!confirm("Wirklich alle Zeichnungen entfernen?")) return;
    pages.forEach((p) => p.ref.current?.clearCanvas());
  };

  const setEraser = (on: boolean) => {
    setEraserMode(on);
    pages.forEach((p) => p.ref.current?.eraseMode(on));
  };

  const produceBlob = async (): Promise<Blob> => {
    // Original-PDF erneut laden, weil pdf-lib mit dem Original arbeiten muss
    const resp = await fetch(pdfUrl);
    if (!resp.ok) throw new Error("Original-PDF konnte nicht geladen werden");
    const origBytes = await resp.arrayBuffer();
    const pdfDoc = await PDFDocument.load(origBytes);
    const pdfPages = pdfDoc.getPages();

    for (let i = 0; i < pages.length && i < pdfPages.length; i++) {
      const sketchRef = pages[i].ref.current;
      if (!sketchRef) continue;
      // Zeichnung als PNG-DataUrl exportieren (transparenter Hintergrund)
      const dataUrl = await sketchRef.exportImage("png");
      // Wenn nichts gezeichnet wurde, weiterspringen (dataUrl ist trotzdem ein leeres PNG)
      const paths = await sketchRef.exportPaths();
      if (!paths || paths.length === 0) continue;

      // DataUrl -> Uint8Array
      const base64 = dataUrl.split(",")[1];
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
      const png = await pdfDoc.embedPng(arr);

      const page = pdfPages[i];
      const { width, height } = page.getSize();
      // Drawing ueber die volle Seitengroesse legen
      page.drawImage(png, { x: 0, y: 0, width, height });
    }

    const out = await pdfDoc.save();
    // Uint8Array -> ArrayBuffer fuer Blob
    return new Blob([out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer], { type: "application/pdf" });
  };

  const handleSave = async (mode: "replace" | "copy") => {
    setSaving(mode);
    try {
      const blob = await produceBlob();
      await onSave(blob, mode);
    } catch (err: any) {
      console.error("PdfEditor save error:", err);
      toast({
        variant: "destructive",
        title: "Speichern fehlgeschlagen",
        description: err?.message || "PDF konnte nicht gespeichert werden",
      });
      setSaving("idle");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (saving !== "idle") return;
    if (!newOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-6xl p-0 flex flex-col gap-0 h-[95vh] overflow-hidden"
        onPointerDownOutside={(e) => saving !== "idle" && e.preventDefault()}
        onEscapeKeyDown={(e) => saving !== "idle" && e.preventDefault()}
      >
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <Pencil className="h-4 w-4 shrink-0" />
            <span className="truncate">PDF bearbeiten</span>
          </DialogTitle>
          <button
            onClick={() => { if (saving === "idle") onClose(); }}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={saving !== "idle"}
            aria-label="Schliessen"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        {/* Toolbar */}
        <div className="border-b px-3 py-2 flex flex-wrap items-center gap-2">
          {/* Farben */}
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => { setStrokeColor(c.value); setEraser(false); }}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all",
                  strokeColor === c.value && !eraserMode ? "border-foreground scale-110" : "border-muted",
                )}
                style={{ background: c.value }}
                title={c.name}
                disabled={saving !== "idle"}
              />
            ))}
          </div>

          {/* Strichstaerke */}
          <div className="flex items-center gap-1 ml-2">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium border",
                  strokeWidth === w ? "bg-foreground text-background" : "bg-background hover:bg-muted",
                )}
                disabled={saving !== "idle"}
              >
                {w}px
              </button>
            ))}
          </div>

          {/* Tools */}
          <Button
            type="button"
            variant={eraserMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEraser(!eraserMode)}
            disabled={saving !== "idle"}
          >
            <Eraser className="h-4 w-4 mr-1" /> Radierer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleUndo} disabled={saving !== "idle"}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleRedo} disabled={saving !== "idle"}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button" variant="outline" size="sm"
            onClick={handleClearAll}
            disabled={saving !== "idle"}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Alles loeschen
          </Button>

          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSave("copy")}
              disabled={saving !== "idle" || loading}
            >
              {saving === "copy" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Copy className="h-4 w-4 mr-1" />}
              Als Kopie
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleSave("replace")}
              disabled={saving !== "idle" || loading}
            >
              {saving === "replace" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Original ersetzen
            </Button>
          </div>
        </div>

        {/* Canvas-Stack */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-muted/30 p-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">PDF wird geladen…</span>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Keine Seiten vorhanden
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {pages.map((p) => {
                const cardWidth = Math.min(p.width, (containerRef.current?.clientWidth ?? p.width) - 24);
                const scale = cardWidth / p.width;
                const cardHeight = p.height * scale;
                return (
                  <div
                    key={p.pageIndex}
                    className="relative shadow-md rounded bg-white"
                    style={{ width: cardWidth, height: cardHeight }}
                  >
                    <img
                      src={p.imgDataUrl}
                      alt={`Seite ${p.pageIndex + 1}`}
                      className="absolute inset-0 w-full h-full pointer-events-none select-none"
                      draggable={false}
                    />
                    <div className="absolute inset-0">
                      <ReactSketchCanvas
                        ref={(el) => { (p.ref as any).current = el; }}
                        width={`${cardWidth}px`}
                        height={`${cardHeight}px`}
                        strokeColor={strokeColor}
                        strokeWidth={strokeWidth}
                        eraserWidth={strokeWidth * 3}
                        canvasColor="transparent"
                        style={{ border: "none", touchAction: "none" }}
                      />
                    </div>
                    <div className="absolute -top-3 left-2 bg-foreground/80 text-background text-xs px-2 py-0.5 rounded">
                      Seite {p.pageIndex + 1} / {pages.length}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          {fileName} · Tippen oder Wischen zum Zeichnen
        </div>
      </DialogContent>
    </Dialog>
  );
}
