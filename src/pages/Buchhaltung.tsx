import { useState, useRef, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload, Play, Download, FileText, Loader2, CheckCircle2, AlertCircle, X,
  ChevronDown, ChevronRight, Trash2, Plus, Eye,
} from "lucide-react";
import "@/lib/pdfjsSetup";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeStorageFileName } from "@/lib/storageFileName";
import { generateBuchhaltungExcel, type BuchhaltungExcelRow } from "@/lib/generateBuchhaltungExcel";

// ===== Typen =====

type UploadStatus = "pending" | "processing" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  errorMsg?: string;
  extracted?: any;
}

interface ReviewPosition {
  id: string;
  baustelle: string;
  menge: string;          // als String editierbar, beim Speichern geparst
  einheit: string;
  artikelbezeichnung: string;
  ekPreis: string;        // als String editierbar
}

interface ReviewRechnung {
  id: string;
  file: File;
  dateiName: string;
  lieferant: string;
  belegnummer: string;
  rechnungsdatum: string | null; // ISO
  lieferdatum: string | null;    // ISO
  betragNetto: number | null;
  betragBrutto: number | null;
  positionen: ReviewPosition[];
  expanded: boolean;
}

interface SammelPosition {
  id: string;
  baustelle: string | null;
  menge: number | null;
  einheit: string | null;
  artikelbezeichnung: string | null;
  ek_preis: number | null;
  aufschlag: number;
}

interface SammelRechnung {
  id: string;
  datei_name: string | null;
  pdf_url: string | null;
  lieferant: string | null;
  belegnummer: string | null;
  rechnungsdatum: string | null;
  lieferdatum: string | null;
  jahr: number;
  buchhaltung_positionen: SammelPosition[];
}

// ===== Helpers =====

// PDF/Bild fuer die KI aufbereiten — Textlayer bevorzugt, sonst Bild-Fallback.
// Entspricht prepareFileForAI aus BatchInvoiceProcessor.
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
          // Kein Textlayer → als Bild rendern
          const pageCanvases: HTMLCanvasElement[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
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

// Robustes Zahlen-Parsing: akzeptiert "1.234,56", "1234.56", "nicht gefunden".
function parseNum(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s.toLowerCase() === "nicht gefunden") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  s = s.replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Datum aus diversen Formaten zu ISO "YYYY-MM-DD".
function parseDateToISO(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "nicht gefunden") return null;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(s);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function isoToDisplay(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

// Baustellen-Vorschlag aus dem Dateinamen (Konvention: datum_lieferant_baustelle…).
function guessBaustelle(fileName: string, known: string[]): string {
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  for (const k of known) {
    const kl = k.trim().toLowerCase();
    if (kl.length >= 4 && base.includes(kl)) return k;
  }
  return "";
}

export default function Buchhaltung() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [reviewRechnungen, setReviewRechnungen] = useState<ReviewRechnung[]>([]);
  const [saving, setSaving] = useState(false);

  const [projektNamen, setProjektNamen] = useState<string[]>([]);
  const [bekannteBaustellen, setBekannteBaustellen] = useState<string[]>([]);

  const currentYear = new Date().getFullYear();
  const [jahr, setJahr] = useState(currentYear);
  const [sammelliste, setSammelliste] = useState<SammelRechnung[]>([]);
  const [sammelLoading, setSammelLoading] = useState(false);

  // Vorschlagsliste fuer Baustellen-Dropdowns: Projekte + bereits verwendete
  const baustellenVorschlaege = Array.from(
    new Set([...projektNamen, ...bekannteBaustellen].map((s) => s.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "de"));

  // --- Stammdaten laden ---
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("name").order("name");
      setProjektNamen((data || []).map((p: any) => p.name).filter(Boolean));
    })();
  }, []);

  const fetchSammelliste = useCallback(async () => {
    setSammelLoading(true);
    const { data, error } = await supabase
      .from("buchhaltung_rechnungen")
      .select("id, datei_name, pdf_url, lieferant, belegnummer, rechnungsdatum, lieferdatum, jahr, buchhaltung_positionen(id, baustelle, menge, einheit, artikelbezeichnung, ek_preis, aufschlag)")
      .eq("jahr", jahr)
      .order("rechnungsdatum", { ascending: true });
    if (error) {
      toast({ variant: "destructive", title: "Fehler beim Laden", description: error.message });
    } else {
      setSammelliste((data || []) as unknown as SammelRechnung[]);
      // bekannte Baustellen aus der Sammelliste anreichern
      const used = new Set<string>();
      for (const r of (data || []) as any[]) {
        for (const p of r.buchhaltung_positionen || []) {
          if (p.baustelle) used.add(p.baustelle);
        }
      }
      setBekannteBaustellen(Array.from(used));
    }
    setSammelLoading(false);
  }, [jahr, toast]);

  useEffect(() => { fetchSammelliste(); }, [fetchSammelliste]);

  // --- Upload ---
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/"),
    );
    if (accepted.length === 0) {
      toast({ variant: "destructive", title: "Keine gültigen Dateien", description: "Nur PDF oder Bilder." });
      return;
    }
    setUploadItems((prev) => [
      ...prev,
      ...accepted.map((f) => ({ id: crypto.randomUUID(), file: f, status: "pending" as UploadStatus })),
    ]);
  };

  const removeUploadItem = (id: string) => {
    setUploadItems((prev) => prev.filter((i) => i.id !== id));
  };

  // --- KI-Analyse ---
  const runAnalysis = async () => {
    const pending = uploadItems
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.status === "pending" || it.status === "error");
    if (pending.length === 0) return;

    setProcessing(true);
    const results: { idx: number; extracted?: any; error?: string }[] = [];

    for (const { idx } of pending) {
      setCurrentIdx(idx);
      setUploadItems((prev) => prev.map((it, i) =>
        i === idx ? { ...it, status: "processing", errorMsg: undefined } : it));
      try {
        const file = uploadItems[idx].file;
        const prepared = await prepareFileForAI(file);
        const invokeBody = prepared.pdfText
          ? { pdfText: prepared.pdfText, docType: "rechnung" }
          : { imageBase64: prepared.base64, mediaType: prepared.mimeType, docType: "rechnung" };
        const { data, error } = await supabase.functions.invoke("extract-document", { body: invokeBody });
        if (error) throw new Error(error.message || "KI-Analyse fehlgeschlagen");
        results.push({ idx, extracted: data });
        setUploadItems((prev) => prev.map((it, i) =>
          i === idx ? { ...it, status: "done", extracted: data } : it));
      } catch (err: any) {
        results.push({ idx, error: err?.message || "Unbekannter Fehler" });
        setUploadItems((prev) => prev.map((it, i) =>
          i === idx ? { ...it, status: "error", errorMsg: err?.message || "Unbekannter Fehler" } : it));
      }
    }
    setCurrentIdx(null);
    setProcessing(false);

    // Erfolgreiche Ergebnisse in die Review-Liste uebernehmen
    const known = Array.from(new Set([...projektNamen, ...bekannteBaustellen]));
    const newReviews: ReviewRechnung[] = [];
    for (const { idx, extracted } of results) {
      if (!extracted) continue;
      const file = uploadItems[idx].file;
      const baustellenGuess = guessBaustelle(file.name, known);
      const posArr = Array.isArray(extracted?.["Positionen"]) ? extracted["Positionen"] : [];
      const positionen: ReviewPosition[] = posArr.map((p: any) => ({
        id: crypto.randomUUID(),
        baustelle: baustellenGuess,
        menge: p?.["Menge"] != null ? String(p["Menge"]) : "",
        einheit: p?.["Einheit"] || "",
        artikelbezeichnung: p?.["Material"] || "",
        ekPreis: p?.["Einzelpreis (€ netto)"] != null ? String(p["Einzelpreis (€ netto)"]) : "",
      }));
      newReviews.push({
        id: crypto.randomUUID(),
        file,
        dateiName: file.name,
        lieferant: extracted?.["Lieferant"] && extracted["Lieferant"] !== "nicht gefunden" ? extracted["Lieferant"] : "",
        belegnummer: extracted?.["Belegnummer"] && extracted["Belegnummer"] !== "nicht gefunden" ? extracted["Belegnummer"] : "",
        rechnungsdatum: parseDateToISO(extracted?.["Datum"]),
        lieferdatum: parseDateToISO(extracted?.["Lieferdatum"]),
        betragNetto: parseNum(extracted?.["Betrag Netto (€)"]),
        betragBrutto: parseNum(extracted?.["Betrag Brutto (€)"]),
        positionen,
        expanded: false,
      });
    }
    if (newReviews.length > 0) {
      setReviewRechnungen((prev) => [...prev, ...newReviews]);
      // analysierte Items aus der Upload-Liste entfernen (sind jetzt im Review)
      setUploadItems((prev) => prev.filter((it) => it.status !== "done"));
    }
    const errCount = results.filter((r) => r.error).length;
    toast({
      title: "Analyse abgeschlossen",
      description: `${newReviews.length} Rechnung(en) erkannt${errCount > 0 ? `, ${errCount} fehlgeschlagen` : ""}.`,
    });
  };

  // --- Review-Bearbeitung ---
  const patchRechnung = (id: string, patch: Partial<ReviewRechnung>) => {
    setReviewRechnungen((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const patchPosition = (rId: string, pId: string, patch: Partial<ReviewPosition>) => {
    setReviewRechnungen((prev) => prev.map((r) =>
      r.id === rId
        ? { ...r, positionen: r.positionen.map((p) => (p.id === pId ? { ...p, ...patch } : p)) }
        : r));
  };
  const setRechnungBaustelle = (rId: string, baustelle: string) => {
    setReviewRechnungen((prev) => prev.map((r) =>
      r.id === rId ? { ...r, positionen: r.positionen.map((p) => ({ ...p, baustelle })) } : r));
  };
  const addPosition = (rId: string) => {
    setReviewRechnungen((prev) => prev.map((r) =>
      r.id === rId
        ? { ...r, positionen: [...r.positionen, { id: crypto.randomUUID(), baustelle: r.positionen[0]?.baustelle || "", menge: "", einheit: "", artikelbezeichnung: "", ekPreis: "" }] }
        : r));
  };
  const removePosition = (rId: string, pId: string) => {
    setReviewRechnungen((prev) => prev.map((r) =>
      r.id === rId ? { ...r, positionen: r.positionen.filter((p) => p.id !== pId) } : r));
  };
  const removeReviewRechnung = (rId: string) => {
    setReviewRechnungen((prev) => prev.filter((r) => r.id !== rId));
  };

  // --- Übernehmen: PDFs hochladen + DB-Insert ---
  const handleUebernehmen = async () => {
    if (reviewRechnungen.length === 0) return;
    // Validierung: jede Position braucht eine Baustelle
    const ohneBaustelle = reviewRechnungen.some((r) =>
      r.positionen.length > 0 && r.positionen.some((p) => !p.baustelle.trim()));
    if (ohneBaustelle) {
      toast({
        variant: "destructive",
        title: "Baustelle fehlt",
        description: "Bitte jeder Position eine Baustelle zuordnen.",
      });
      return;
    }
    const leereRechnung = reviewRechnungen.find((r) => r.positionen.length === 0);
    if (leereRechnung) {
      toast({
        variant: "destructive",
        title: "Rechnung ohne Positionen",
        description: `"${leereRechnung.dateiName}" hat keine Positionen. Bitte ergänzen oder entfernen.`,
      });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    let okCount = 0;
    const failed: string[] = [];

    for (const r of reviewRechnungen) {
      try {
        const rechnungsJahr = r.rechnungsdatum
          ? Number(r.rechnungsdatum.slice(0, 4))
          : currentYear;

        // 1) PDF in den Bucket laden
        let pdfPath: string | null = null;
        try {
          const safe = sanitizeStorageFileName(r.file.name);
          const path = `${rechnungsJahr}/${Date.now()}_${safe}`;
          const { error: upErr } = await supabase.storage.from("buchhaltung").upload(path, r.file);
          if (upErr) throw upErr;
          pdfPath = path;
        } catch (upErr: any) {
          // Upload-Fehler ist nicht fatal — Daten trotzdem speichern
          console.error("PDF-Upload fehlgeschlagen:", upErr);
        }

        // 2) Rechnung anlegen
        const { data: rechnungRow, error: rErr } = await supabase
          .from("buchhaltung_rechnungen")
          .insert({
            datei_name: r.dateiName,
            pdf_url: pdfPath,
            lieferant: r.lieferant || null,
            belegnummer: r.belegnummer || null,
            rechnungsdatum: r.rechnungsdatum,
            lieferdatum: r.lieferdatum,
            betrag_netto: r.betragNetto,
            betrag_brutto: r.betragBrutto,
            jahr: rechnungsJahr,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (rErr) throw rErr;

        // 3) Positionen anlegen
        const posRows = r.positionen.map((p, idx) => ({
          rechnung_id: rechnungRow.id,
          baustelle: p.baustelle.trim() || null,
          menge: parseNum(p.menge),
          einheit: p.einheit.trim() || null,
          artikelbezeichnung: p.artikelbezeichnung.trim() || null,
          ek_preis: parseNum(p.ekPreis),
          aufschlag: 0,
          sortierung: idx,
        }));
        const { error: pErr } = await supabase.from("buchhaltung_positionen").insert(posRows);
        if (pErr) {
          // Cleanup: Rechnung wieder entfernen, damit keine leere Rechnung bleibt
          await supabase.from("buchhaltung_rechnungen").delete().eq("id", rechnungRow.id);
          throw pErr;
        }
        okCount++;
      } catch (err: any) {
        failed.push(`${r.dateiName}: ${err?.message || "Fehler"}`);
      }
    }

    setSaving(false);

    if (okCount > 0) {
      toast({ title: "Gespeichert", description: `${okCount} Rechnung(en) in die Sammelliste übernommen.` });
      setReviewRechnungen((prev) => prev.filter((r) => {
        // erfolgreiche entfernen — nur fehlgeschlagene bleiben stehen
        return failed.some((f) => f.startsWith(r.dateiName + ":"));
      }));
      fetchSammelliste();
    }
    if (failed.length > 0) {
      toast({
        variant: "destructive",
        title: `${failed.length} Rechnung(en) fehlgeschlagen`,
        description: failed.slice(0, 3).join(" · "),
      });
    }
  };

  // --- Sammelliste: Aktionen ---
  const handleDeleteRechnung = async (id: string, name: string | null) => {
    if (!confirm(`Rechnung "${name || "ohne Name"}" und alle Positionen löschen?`)) return;
    const { error } = await supabase.from("buchhaltung_rechnungen").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Löschen fehlgeschlagen", description: error.message });
      return;
    }
    toast({ title: "Gelöscht" });
    fetchSammelliste();
  };

  const handleUpdateSammelBaustelle = async (positionId: string, baustelle: string) => {
    // optimistisch im State setzen
    setSammelliste((prev) => prev.map((r) => ({
      ...r,
      buchhaltung_positionen: r.buchhaltung_positionen.map((p) =>
        p.id === positionId ? { ...p, baustelle } : p),
    })));
    const { error } = await supabase
      .from("buchhaltung_positionen")
      .update({ baustelle: baustelle.trim() || null })
      .eq("id", positionId);
    if (error) {
      toast({ variant: "destructive", title: "Speichern fehlgeschlagen", description: error.message });
      fetchSammelliste();
    }
  };

  const handleViewPdf = async (pdfPath: string | null) => {
    if (!pdfPath) {
      toast({ variant: "destructive", title: "Kein PDF", description: "Für diese Rechnung wurde kein PDF gespeichert." });
      return;
    }
    const { data, error } = await supabase.storage.from("buchhaltung").createSignedUrl(pdfPath, 300);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Fehler", description: error?.message || "PDF nicht verfügbar." });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleExportExcel = () => {
    const rows: BuchhaltungExcelRow[] = [];
    for (const r of sammelliste) {
      for (const p of r.buchhaltung_positionen) {
        rows.push({
          baustelle: p.baustelle || "",
          menge: p.menge,
          einheit: p.einheit || "",
          artikelbezeichnung: p.artikelbezeichnung || "",
          ekPreis: p.ek_preis,
          aufschlag: p.aufschlag ?? 0,
          rechnungsdatum: r.rechnungsdatum,
          lieferdatum: r.lieferdatum || r.rechnungsdatum, // Fallback = Rechnungsdatum
          lieferant: r.lieferant || "",
        });
      }
    }
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Nichts zu exportieren", description: `Keine Rechnungen für ${jahr}.` });
      return;
    }
    generateBuchhaltungExcel(rows, jahr);
    toast({ title: "Excel exportiert", description: `${rows.length} Positionen für ${jahr}.` });
  };

  // --- abgeleitete Werte ---
  const pendingCount = uploadItems.filter((i) => i.status === "pending" || i.status === "error").length;
  const doneCount = uploadItems.filter((i) => i.status === "done").length;
  const errorCount = uploadItems.filter((i) => i.status === "error").length;
  const progress = uploadItems.length > 0
    ? Math.round(((doneCount + errorCount) / uploadItems.length) * 100)
    : 0;
  const sammelPositionenCount = sammelliste.reduce((s, r) => s + r.buchhaltung_positionen.length, 0);
  const jahrOptionen = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Buchhaltung" backPath="/" />
      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-6xl space-y-6">

        {/* ===== 1. Rechnungen hochladen ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rechnungen hochladen &amp; analysieren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
            >
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">PDF-Rechnungen hierher ziehen oder klicken</p>
              <p className="text-xs text-muted-foreground">Mehrere Dateien möglich · PDF und Bilder</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />

            {uploadItems.length > 0 && (
              <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                {uploadItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate min-w-0">{item.file.name}</span>
                    {item.status === "pending" && <Badge variant="outline" className="text-xs">Bereit</Badge>}
                    {item.status === "processing" && (
                      <Badge className="text-xs bg-blue-100 text-blue-800">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Läuft
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
                      <button onClick={() => removeUploadItem(item.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {processing && (
              <div className="space-y-1">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">
                  {doneCount + errorCount} / {uploadItems.length} verarbeitet
                  {currentIdx != null && uploadItems[currentIdx] && ` · ${uploadItems[currentIdx].file.name}`}
                </p>
              </div>
            )}

            {pendingCount > 0 && (
              <Button onClick={runAnalysis} disabled={processing} className="w-full sm:w-auto">
                {processing
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analysiere…</>
                  : <><Play className="h-4 w-4 mr-1" /> {pendingCount} Rechnung(en) analysieren</>}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ===== 2. Review ===== */}
        {reviewRechnungen.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Prüfen &amp; Baustellen zuordnen ({reviewRechnungen.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewRechnungen.map((r) => {
                const positionsBaustellen = new Set(r.positionen.map((p) => p.baustelle));
                const einheitlich = positionsBaustellen.size <= 1;
                const gemeinsam = einheitlich ? (r.positionen[0]?.baustelle || "") : "";
                return (
                  <div key={r.id} className="border rounded-lg">
                    {/* Kopfzeile */}
                    <div className="flex flex-wrap items-center gap-2 p-3">
                      <button
                        onClick={() => patchRechnung(r.id, { expanded: !r.expanded })}
                        className="flex items-center gap-1 text-sm font-medium min-w-0"
                      >
                        {r.expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <span className="truncate">{r.lieferant || r.dateiName}</span>
                      </button>
                      <Badge variant="outline" className="text-xs">
                        {isoToDisplay(r.rechnungsdatum) || "kein Datum"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{r.positionen.length} Pos.</Badge>
                      {r.betragBrutto != null && (
                        <Badge variant="outline" className="text-xs">€ {r.betragBrutto.toFixed(2)}</Badge>
                      )}
                      <div className="flex-1" />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Baustelle:</span>
                        <Input
                          list="buchh-baustellen"
                          value={gemeinsam}
                          placeholder={einheitlich ? "zuordnen…" : "gemischt"}
                          onChange={(e) => setRechnungBaustelle(r.id, e.target.value)}
                          className="h-8 w-44 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => removeReviewRechnung(r.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Rechnung verwerfen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Positionen */}
                    {r.expanded && (
                      <div className="border-t p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-muted-foreground">
                            Lieferant
                            <Input value={r.lieferant} onChange={(e) => patchRechnung(r.id, { lieferant: e.target.value })} className="h-8 text-sm mt-0.5" />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Belegnummer
                            <Input value={r.belegnummer} onChange={(e) => patchRechnung(r.id, { belegnummer: e.target.value })} className="h-8 text-sm mt-0.5" />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Rechnungsdatum
                            <Input type="date" value={r.rechnungsdatum || ""} onChange={(e) => patchRechnung(r.id, { rechnungsdatum: e.target.value || null })} className="h-8 text-sm mt-0.5" />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Lieferdatum
                            <Input type="date" value={r.lieferdatum || ""} onChange={(e) => patchRechnung(r.id, { lieferdatum: e.target.value || null })} className="h-8 text-sm mt-0.5" />
                          </label>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground">
                                <th className="py-1 pr-2 font-medium">Baustelle</th>
                                <th className="py-1 pr-2 font-medium w-16">Menge</th>
                                <th className="py-1 pr-2 font-medium w-16">Einheit</th>
                                <th className="py-1 pr-2 font-medium">Artikelbezeichnung</th>
                                <th className="py-1 pr-2 font-medium w-20">EK Preis</th>
                                <th className="w-6" />
                              </tr>
                            </thead>
                            <tbody>
                              {r.positionen.map((p) => (
                                <tr key={p.id}>
                                  <td className="py-0.5 pr-2">
                                    <Input list="buchh-baustellen" value={p.baustelle}
                                      onChange={(e) => patchPosition(r.id, p.id, { baustelle: e.target.value })}
                                      className="h-7 text-xs" />
                                  </td>
                                  <td className="py-0.5 pr-2">
                                    <Input value={p.menge}
                                      onChange={(e) => patchPosition(r.id, p.id, { menge: e.target.value })}
                                      className="h-7 text-xs" />
                                  </td>
                                  <td className="py-0.5 pr-2">
                                    <Input value={p.einheit}
                                      onChange={(e) => patchPosition(r.id, p.id, { einheit: e.target.value })}
                                      className="h-7 text-xs" />
                                  </td>
                                  <td className="py-0.5 pr-2">
                                    <Input value={p.artikelbezeichnung}
                                      onChange={(e) => patchPosition(r.id, p.id, { artikelbezeichnung: e.target.value })}
                                      className="h-7 text-xs" />
                                  </td>
                                  <td className="py-0.5 pr-2">
                                    <Input value={p.ekPreis}
                                      onChange={(e) => patchPosition(r.id, p.id, { ekPreis: e.target.value })}
                                      className="h-7 text-xs" />
                                  </td>
                                  <td className="py-0.5">
                                    <button onClick={() => removePosition(r.id, p.id)} className="text-muted-foreground hover:text-destructive">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => addPosition(r.id)} className="h-7 text-xs">
                          <Plus className="h-3 w-3 mr-1" /> Position
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end pt-1">
                <Button onClick={handleUebernehmen} disabled={saving}>
                  {saving
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Speichere…</>
                    : <><CheckCircle2 className="h-4 w-4 mr-1" /> In Sammelliste übernehmen</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== 3. Jahres-Sammelliste ===== */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Sammelliste {jahr}</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={String(jahr)} onValueChange={(v) => setJahr(Number(v))}>
                  <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {jahrOptionen.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleExportExcel} disabled={sammelPositionenCount === 0}>
                  <Download className="h-4 w-4 mr-1" /> Als Excel exportieren
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sammelLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                <Loader2 className="h-4 w-4 mr-1 animate-spin inline" /> Lädt…
              </p>
            ) : sammelliste.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Noch keine Rechnungen für {jahr}. Lade oben PDFs hoch.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {sammelliste.length} Rechnungen · {sammelPositionenCount} Positionen
                </p>
                {sammelliste.map((r) => (
                  <div key={r.id} className="border rounded-lg">
                    <div className="flex flex-wrap items-center gap-2 p-2.5 bg-muted/30">
                      <span className="text-sm font-medium truncate min-w-0">{r.lieferant || r.datei_name || "Rechnung"}</span>
                      <Badge variant="outline" className="text-xs">{isoToDisplay(r.rechnungsdatum)}</Badge>
                      {r.belegnummer && <Badge variant="outline" className="text-xs">Nr. {r.belegnummer}</Badge>}
                      <Badge variant="outline" className="text-xs">{r.buchhaltung_positionen.length} Pos.</Badge>
                      <div className="flex-1" />
                      {r.pdf_url && (
                        <button onClick={() => handleViewPdf(r.pdf_url)} className="text-muted-foreground hover:text-primary" title="PDF ansehen">
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => handleDeleteRechnung(r.id, r.lieferant || r.datei_name)} className="text-muted-foreground hover:text-destructive" title="Rechnung löschen">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-1 px-2 font-medium">Baustelle</th>
                            <th className="py-1 px-2 font-medium">Menge</th>
                            <th className="py-1 px-2 font-medium">Einheit</th>
                            <th className="py-1 px-2 font-medium">Artikelbezeichnung</th>
                            <th className="py-1 px-2 font-medium text-right">EK Preis</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.buchhaltung_positionen.map((p) => (
                            <tr key={p.id} className="border-b last:border-0">
                              <td className="py-0.5 px-2">
                                <Input list="buchh-baustellen" defaultValue={p.baustelle || ""}
                                  onBlur={(e) => {
                                    if (e.target.value !== (p.baustelle || "")) {
                                      handleUpdateSammelBaustelle(p.id, e.target.value);
                                    }
                                  }}
                                  className="h-7 text-xs w-40" />
                              </td>
                              <td className="py-1 px-2">{p.menge ?? "—"}</td>
                              <td className="py-1 px-2">{p.einheit || "—"}</td>
                              <td className="py-1 px-2">{p.artikelbezeichnung || "—"}</td>
                              <td className="py-1 px-2 text-right">{p.ek_preis != null ? p.ek_preis.toFixed(2) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Gemeinsame Vorschlagsliste fuer alle Baustellen-Eingaben */}
      <datalist id="buchh-baustellen">
        {baustellenVorschlaege.map((b) => <option key={b} value={b} />)}
      </datalist>
    </div>
  );
}
