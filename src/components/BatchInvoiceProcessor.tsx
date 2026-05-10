import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Play, Download, FileText, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import "@/lib/pdfjsSetup";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Status = "pending" | "processing" | "done" | "error";

type Item = {
  id: string;
  file: File;
  status: Status;
  errorMsg?: string;
  extracted?: any;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Entspricht prepareFileForAI aus IncomingInvoices
const prepareFileForAI = (file: File): Promise<{ base64: string; mimeType: string; pdfText?: string }> =>
  new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument({ data }).promise;
          const pageTexts: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            pageTexts.push(`--- Seite ${i} ---\n${pageText}`);
          }
          const fullText = pageTexts.join("\n\n");
          if (fullText.trim().length > 100) {
            resolve({ base64: "", mimeType: "application/pdf", pdfText: fullText });
            return;
          }
          // Fallback: Render PDFs als Bild wenn kein Text
          const pageCanvases: HTMLCanvasElement[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
            pageCanvases.push(canvas);
          }
          const totalW = pageCanvases[0].width;
          const totalH = pageCanvases.reduce((s, c) => s + c.height, 0);
          const combined = document.createElement("canvas");
          combined.width = totalW;
          combined.height = totalH;
          const ctx = combined.getContext("2d")!;
          let y = 0;
          for (const pc of pageCanvases) { ctx.drawImage(pc, 0, y); y += pc.height; }
          let w = combined.width, h = combined.height;
          if (w > 1400) { h = Math.round(h * 1400 / w); w = 1400; }
          if (h > 5000) { w = Math.round(w * 5000 / h); h = 5000; }
          const out = document.createElement("canvas");
          out.width = w; out.height = h;
          out.getContext("2d")!.drawImage(combined, 0, 0, w, h);
          const dataUrl = out.toDataURL("image/jpeg", 0.75);
          resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > 1500) { h = Math.round(h * 1500 / w); w = 1500; }
          if (h > 1500) { w = Math.round(w * 1500 / h); h = 1500; }
          const out = document.createElement("canvas");
          out.width = w; out.height = h;
          out.getContext("2d")!.drawImage(img, 0, 0, w, h);
          const dataUrl = out.toDataURL("image/jpeg", 0.85);
          resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    }
  });

export function BatchInvoiceProcessor({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: Item[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const runAll = async () => {
    setProcessing(true);
    const pending = items.map((i, idx) => ({ i, idx })).filter(({ i }) => i.status === "pending" || i.status === "error");
    for (const { idx } of pending) {
      setCurrentIdx(idx);
      setItems((prev) => prev.map((it, i) => i === idx ? { ...it, status: "processing", errorMsg: undefined } : it));
      try {
        const file = items[idx].file;
        const prepared = await prepareFileForAI(file);
        const invokeBody = prepared.pdfText
          ? { pdfText: prepared.pdfText }
          : { imageBase64: prepared.base64, mediaType: prepared.mimeType };
        const { data, error } = await supabase.functions.invoke("extract-document", { body: invokeBody });
        if (error) throw new Error(error.message || "KI-Fehler");
        setItems((prev) => prev.map((it, i) => i === idx ? { ...it, status: "done", extracted: data } : it));
      } catch (err: any) {
        setItems((prev) => prev.map((it, i) => i === idx ? { ...it, status: "error", errorMsg: err.message || "Unbekannter Fehler" } : it));
      }
    }
    setCurrentIdx(null);
    setProcessing(false);
  };

  const exportExcel = () => {
    const done = items.filter((i) => i.status === "done" && i.extracted);
    if (done.length === 0) {
      toast({ variant: "destructive", title: "Nichts zu exportieren", description: "Erst KI-Analyse laufen lassen." });
      return;
    }
    const rows: any[] = [];
    for (const item of done) {
      const d = item.extracted;
      const positionen = Array.isArray(d?.["Positionen"]) ? d["Positionen"] : [];
      if (positionen.length === 0) {
        // zumindest Header-Zeile pro Rechnung
        rows.push({
          Datei: item.file.name,
          Lieferant: d?.["Lieferant"] || "",
          Datum: d?.["Datum"] || "",
          Belegnummer: d?.["Belegnummer"] || "",
          Material: "",
          Menge: "",
          Einheit: "",
          "Einzelpreis (€)": "",
          "Gesamt (€)": "",
          "Rechnung Brutto (€)": d?.["Betrag Brutto (€)"] != null ? String(d["Betrag Brutto (€)"]).replace(".", ",") : "",
        });
      } else {
        for (const pos of positionen) {
          rows.push({
            Datei: item.file.name,
            Lieferant: d?.["Lieferant"] || "",
            Datum: d?.["Datum"] || "",
            Belegnummer: d?.["Belegnummer"] || "",
            Material: pos["Material"] || "",
            Menge: pos["Menge"] != null ? String(pos["Menge"]).replace(".", ",") : "",
            Einheit: pos["Einheit"] || "",
            "Einzelpreis (€)": pos["Einzelpreis (€ netto)"] != null ? String(pos["Einzelpreis (€ netto)"]).replace(".", ",") : "",
            "Gesamt (€)": pos["Gesamt (€ netto)"] != null ? String(pos["Gesamt (€ netto)"]).replace(".", ",") : "",
            "Rechnung Brutto (€)": d?.["Betrag Brutto (€)"] != null ? String(d["Betrag Brutto (€)"]).replace(".", ",") : "",
          });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rechnungen");
    XLSX.writeFile(wb, `Rechnungen_Batch_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Excel exportiert" });
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !processing && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mehrere Rechnungen analysieren</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lade mehrere Rechnungen (PDF oder Bild) hoch. Die KI analysiert sie nacheinander und extrahiert alle Positionen.
            Am Ende exportierst du alles als Excel mit Komma-Dezimaltrennzeichen.
          </p>

          {/* Upload Zone */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Dateien auswählen oder hierher ziehen</p>
            <p className="text-xs text-muted-foreground">PDF und Bilder</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />

          {/* Liste */}
          {items.length > 0 && (
            <>
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate min-w-0">{item.file.name}</span>
                    {item.status === "pending" && <Badge variant="outline" className="text-xs">Bereit</Badge>}
                    {item.status === "processing" && (
                      <Badge className="text-xs bg-blue-100 text-blue-800">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Läuft...
                      </Badge>
                    )}
                    {item.status === "done" && (
                      <Badge className="text-xs bg-green-100 text-green-800">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Fertig
                      </Badge>
                    )}
                    {item.status === "error" && (
                      <Badge className="text-xs bg-red-100 text-red-800" title={item.errorMsg}>
                        <AlertCircle className="h-3 w-3 mr-1" /> Fehler
                      </Badge>
                    )}
                    {!processing && (
                      <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress */}
              {processing && (
                <div className="space-y-1">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">
                    {doneCount + errorCount} / {totalCount} verarbeitet
                    {currentIdx != null && items[currentIdx] && ` · aktuell: ${items[currentIdx].file.name}`}
                  </p>
                </div>
              )}

              {!processing && (doneCount > 0 || errorCount > 0) && (
                <div className="p-2 rounded-lg bg-muted/50 text-xs flex items-center gap-4">
                  {doneCount > 0 && <span className="text-green-700">✓ {doneCount} erfolgreich</span>}
                  {errorCount > 0 && <span className="text-red-700">✗ {errorCount} fehlgeschlagen</span>}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Schließen
          </Button>
          {items.some((i) => i.status === "pending" || i.status === "error") && (
            <Button onClick={runAll} disabled={processing || items.length === 0}>
              {processing
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Läuft...</>
                : <><Play className="h-4 w-4 mr-1" /> KI-Analyse starten</>}
            </Button>
          )}
          {doneCount > 0 && !processing && (
            <Button variant="default" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-1" /> Als Excel exportieren
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
