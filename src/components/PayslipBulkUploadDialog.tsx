import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, Check, AlertTriangle, ArrowRight, ArrowLeft, Loader2, FileText, Send, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

// Set worker path for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type Employee = {
  user_id: string;
  vorname: string;
  nachname: string;
};

type Assignment = {
  employee_name: string;
  matched_user_id: string | null;
  pages: number[];
  confidence: "high" | "low";
  release_date: string; // Freigabedatum pro Mitarbeiter — default uebernommen aus globalem Wert
  // Urlaubsdaten aus dem Lohnzettel — KI-Extraktion, vom Admin editierbar
  urlaubsanspruch: number | null;
  resturlaub: number | null;
  urlaub_einheit: "tage" | "stunden" | null;
  stichtag: string | null; // YYYY-MM-DD
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayslipBulkUploadDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);

  const [step, setStep] = useState(1);
  const [releaseDate, setReleaseDate] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [unassignedPages, setUnassignedPages] = useState<number[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pageThumbnails, setPageThumbnails] = useState<Map<number, string>>(new Map());
  const [lightboxPage, setLightboxPage] = useState<{ pageIdx: number; pages: number[] } | null>(null);
  const [pageFullImages, setPageFullImages] = useState<Map<number, string>>(new Map());

  const reset = () => {
    setStep(1);
    setPdfFile(null);
    setPdfBytes(null);
    setTotalPages(0);
    setAssignments([]);
    setUnassignedPages([]);
    setProgress(0);
    setAnalyzing(false);
    setSaving(false);
    setPageThumbnails(new Map());
    setLightboxPage(null);
    setPageFullImages(new Map());
    pdfDocRef.current = null;
    // releaseDate wird in useEffect geladen, nicht reset
  };

  // Beim Oeffnen: zuletzt verwendetes Freigabedatum laden
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "last_payslip_release_date")
        .maybeSingle();
      const saved = (data?.value || "").trim();
      if (saved) {
        setReleaseDate(saved);
      } else {
        // Default: 10. des naechsten Monats
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        d.setDate(10);
        setReleaseDate(d.toISOString().split("T")[0]);
      }
    })();
  }, [open]);

  const openLightbox = async (pageIdx: number, pages: number[]) => {
    if (!pageFullImages.has(pageIdx) && pdfDocRef.current) {
      const page = await pdfDocRef.current.getPage(pageIdx + 1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      setPageFullImages((prev) => new Map(prev).set(pageIdx, canvas.toDataURL("image/jpeg", 0.9)));
    }
    setLightboxPage({ pageIdx, pages });
  };

  const removePage = (assignmentIdx: number, pageIdx: number) => {
    setAssignments((prev) =>
      prev
        .map((a, i) =>
          i === assignmentIdx ? { ...a, pages: a.pages.filter((p) => p !== pageIdx) } : a
        )
        .filter((a) => a.pages.length > 0)
    );
    setUnassignedPages((prev) => [...prev, pageIdx].sort((a, b) => a - b));
  };

  const assignUnassignedPage = (pageIdx: number, assignmentIdxStr: string) => {
    const idx = Number(assignmentIdxStr);
    setAssignments((prev) =>
      prev.map((a, i) =>
        i === idx ? { ...a, pages: [...a.pages, pageIdx].sort((a, b) => a - b) } : a
      )
    );
    setUnassignedPages((prev) => prev.filter((p) => p !== pageIdx));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    const buffer = await file.arrayBuffer();
    setPdfBytes(buffer);

    // Get page count
    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    setTotalPages(pdfDoc.numPages);
  };

  const handleAnalyze = async () => {
    if (!pdfBytes) return;
    setAnalyzing(true);

    try {
      // 1. Fetch employees
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .not("user_id", "is", null);

      if (empError) {
        toast({ variant: "destructive", title: "Fehler beim Laden der Mitarbeiter", description: empError.message });
        setAnalyzing(false);
        return;
      }
      if (!empData || empData.length === 0) {
        toast({ variant: "destructive", title: "Keine Mitarbeiter gefunden", description: "Es sind keine Mitarbeiter mit verknüpftem Account vorhanden." });
        setAnalyzing(false);
        return;
      }
      setEmployees(empData as Employee[]);

      // 2. Extract text from each page
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) }).promise;
      pdfDocRef.current = pdfDoc;
      const pageTexts: string[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item: unknown) => (item as { str: string }).str)
          .join(" ");
        pageTexts.push(text);
      }

      // 2b. Render page thumbnails for preview
      const thumbnails = new Map<number, string>();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        thumbnails.set(i - 1, canvas.toDataURL("image/jpeg", 0.7));
      }
      setPageThumbnails(thumbnails);

      // 3. Call edge function for AI analysis
      const { data, error } = await supabase.functions.invoke("split-payslips", {
        body: {
          pdfText: pageTexts,
          employees: empData.map((e) => ({
            vorname: e.vorname,
            nachname: e.nachname,
            user_id: e.user_id,
          })),
        },
      });

      if (error) throw error;

      // Jeder erkannte Eintrag bekommt das globale Datum als Default;
      // der Admin kann es anschliessend pro MA ueberschreiben.
      // Urlaubsdaten kommen direkt aus der KI-Extraktion (können null sein).
      const withDates: Assignment[] = (data.assignments || []).map((a: Partial<Assignment> & { employee_name: string; matched_user_id: string | null; pages: number[]; confidence: "high" | "low" }) => ({
        employee_name: a.employee_name,
        matched_user_id: a.matched_user_id,
        pages: a.pages,
        confidence: a.confidence,
        release_date: releaseDate,
        urlaubsanspruch: a.urlaubsanspruch ?? null,
        resturlaub: a.resturlaub ?? null,
        urlaub_einheit: a.urlaub_einheit ?? null,
        stichtag: a.stichtag ?? null,
      }));
      setAssignments(withDates);
      setUnassignedPages(data.unassigned_pages || []);
      setStep(2);
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Analyse fehlgeschlagen", description: (err as Error).message });
    } finally {
      setAnalyzing(false);
    }
  };

  const updateAssignment = (index: number, userId: string) => {
    const emp = employees.find((e) => e.user_id === userId);
    if (!emp) return;
    setAssignments((prev) =>
      prev.map((a, i) =>
        i === index
          ? { ...a, matched_user_id: userId, employee_name: `${emp.vorname} ${emp.nachname}`, confidence: "high" as const }
          : a
      )
    );
  };

  const updateAssignmentReleaseDate = (index: number, date: string) => {
    setAssignments((prev) =>
      prev.map((a, i) => (i === index ? { ...a, release_date: date } : a))
    );
  };

  const applyReleaseDateToAll = (date: string) => {
    setAssignments((prev) => prev.map((a) => ({ ...a, release_date: date })));
  };

  const updateAssignmentVacation = (
    index: number,
    field: "urlaubsanspruch" | "resturlaub" | "urlaub_einheit" | "stichtag",
    value: string
  ) => {
    setAssignments((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        if (field === "urlaubsanspruch" || field === "resturlaub") {
          const num = value === "" ? null : parseFloat(value.replace(",", "."));
          return { ...a, [field]: Number.isNaN(num) ? null : num };
        }
        if (field === "urlaub_einheit") {
          return { ...a, urlaub_einheit: (value as "tage" | "stunden") || null };
        }
        return { ...a, stichtag: value || null };
      })
    );
  };

  const handleSave = async () => {
    if (!pdfBytes) return;
    setSaving(true);
    setStep(3);

    try {
      // Dedupe: wenn die KI denselben MA zweimal erkannt hat (z.B. "Max Mueller"
      // und "M. Mueller"), behalten wir nur den ersten Eintrag
      const seen = new Set<string>();
      const duplicateNames: string[] = [];
      const validAssignments = assignments.filter((a) => {
        if (!a.matched_user_id) return false;
        if (seen.has(a.matched_user_id)) {
          duplicateNames.push(a.employee_name);
          return false;
        }
        seen.add(a.matched_user_id);
        return true;
      });
      if (duplicateNames.length > 0) {
        toast({
          title: "Duplikate uebersprungen",
          description: `${duplicateNames.length} doppelte Zuordnung(en): ${duplicateNames.join(", ")}`,
        });
      }
      const total = validAssignments.length;
      let done = 0;

      const sourcePdf = await PDFDocument.load(pdfBytes.slice(0));
      const notifiedUserIds: string[] = [];

      for (const assignment of validAssignments) {
        if (!assignment.matched_user_id) continue;

        // Create individual PDF with assigned pages
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(
          sourcePdf,
          assignment.pages
        );
        copiedPages.forEach((page) => newPdf.addPage(page));

        const pdfBytesOut = await newPdf.save();
        const blob = new Blob([pdfBytesOut], { type: "application/pdf" });

        // Upload to storage
        const now = new Date();
        const monthYear = `${String(now.getMonth() + 1).padStart(2, "0")}_${now.getFullYear()}`;
        const fileName = `${Date.now()}_Lohnzettel_${monthYear}.pdf`;
        const filePath = `${assignment.matched_user_id}/lohnzettel/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("employee-documents")
          .upload(filePath, blob);
        if (uploadError) {
          console.error(`Upload error for ${assignment.employee_name}:`, uploadError);
          continue;
        }

        // Metadaten mit individuellem Freigabedatum + Urlaubsdaten speichern
        const perRowRelease = assignment.release_date || releaseDate;
        await (supabase.from("payslip_metadata") as any).insert({
          user_id: assignment.matched_user_id,
          file_path: filePath,
          release_date: perRowRelease,
          urlaubsanspruch: assignment.urlaubsanspruch,
          resturlaub: assignment.resturlaub,
          urlaub_einheit: assignment.urlaub_einheit,
          stichtag: assignment.stichtag,
        });

        // In-App notification nur wenn Freigabedatum heute oder in Vergangenheit
        const today = new Date().toISOString().split("T")[0];
        if (perRowRelease <= today) {
          await supabase.from("notifications").insert({
            user_id: assignment.matched_user_id,
            type: "lohnzettel_upload",
            title: "Neuer Lohnzettel verfügbar",
            message: "Ein neuer Lohnzettel wurde für Sie hochgeladen.",
            metadata: { file_name: fileName },
          });
          notifiedUserIds.push(assignment.matched_user_id);
        }
        done++;
        setProgress(Math.round((done / total) * 100));
      }

      // Zuletzt verwendetes Freigabedatum persistieren
      await supabase.from("app_settings").upsert({
        key: "last_payslip_release_date",
        value: releaseDate,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

      // Send push notifications (batch)
      if (notifiedUserIds.length > 0) {
        await supabase.functions.invoke("send-push", {
          body: {
            user_ids: notifiedUserIds,
            title: "Neuer Lohnzettel",
            body: "Ein neuer Lohnzettel wurde für Sie hochgeladen.",
            url: "/my-documents",
          },
        });
      }

      toast({
        title: "Lohnzettel verteilt",
        description: `${done} Lohnzettel an ${done} Mitarbeiter zugestellt.`,
      });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Fehler", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const validCount = assignments.filter((a) => a.matched_user_id).length;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Sammel-Lohnzettel hochladen — Schritt {step}/3</DialogTitle>
          </DialogHeader>

          {/* Step 1: Upload PDF */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Laden Sie das Sammel-PDF mit allen Lohnzetteln hoch. Die KI erkennt automatisch,
                welche Seiten zu welchem Mitarbeiter gehören.
              </p>

              {!pdfFile ? (
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">PDF-Datei auswählen</p>
                  <p className="text-xs text-muted-foreground">Sammel-PDF mit allen Lohnzetteln</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
                  <FileText className="w-8 h-8 text-red-500" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{pdfFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {totalPages} Seiten • {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setPdfFile(null); setPdfBytes(null); setTotalPages(0); }}>
                    Andere Datei
                  </Button>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Freigabedatum */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Calendar className="w-4 h-4" />
                  Freigabedatum — Mitarbeiter sieht Lohnzettel erst ab diesem Tag
                </Label>
                <Input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Voreingestellt auf zuletzt verwendeten Wert. Bis zum Freigabedatum bleibt der Lohnzettel für den Mitarbeiter unsichtbar.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleAnalyze} disabled={!pdfFile || !releaseDate || analyzing}>
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      KI analysiert...
                    </>
                  ) : (
                    <>
                      Analysieren <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Review Assignments */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {validCount} von {assignments.length} Lohnzetteln zugeordnet.
                {unassignedPages.length > 0 && ` ${unassignedPages.length} Seiten nicht zugeordnet.`}
              </p>

              {/* Globaler Datum-Override: setzt Freigabedatum fuer alle Zeilen */}
              <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Freigabedatum fuer alle:</span>
                <Input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="h-8 text-xs w-40"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => applyReleaseDateToAll(releaseDate)}
                >
                  Auf alle anwenden
                </Button>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {assignments.map((a, i) => (
                  <div
                    key={i}
                    className={`p-3 border rounded-lg ${
                      a.matched_user_id ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="shrink-0">
                        {a.matched_user_id ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{a.employee_name || "Nicht erkannt"}</span>
                          <Badge variant="outline" className="text-xs">
                            {a.pages.length === 1
                              ? `Seite ${a.pages[0] + 1}`
                              : `Seiten ${a.pages[0] + 1}–${a.pages[a.pages.length - 1] + 1}`}
                          </Badge>
                          {a.confidence === "low" && (
                            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                              Unsicher
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Select
                        value={a.matched_user_id || ""}
                        onValueChange={(v) => updateAssignment(i, v)}
                      >
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue placeholder="Zuordnen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((emp) => (
                            <SelectItem key={emp.user_id} value={emp.user_id}>
                              {emp.vorname} {emp.nachname}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="date"
                          value={a.release_date}
                          onChange={(e) => updateAssignmentReleaseDate(i, e.target.value)}
                          className="h-8 text-xs w-36"
                          title="Freigabedatum fuer diesen Mitarbeiter"
                        />
                      </div>
                    </div>
                    {/* Urlaubsdaten aus Lohnzettel (KI-extrahiert, editierbar) */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-green-200/60 flex-wrap text-xs">
                      <span className="text-muted-foreground font-medium">Urlaub:</span>
                      <Select
                        value={a.urlaub_einheit || ""}
                        onValueChange={(v) => updateAssignmentVacation(i, "urlaub_einheit", v)}
                      >
                        <SelectTrigger className="w-24 h-7 text-xs">
                          <SelectValue placeholder="Einheit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tage">Tage</SelectItem>
                          <SelectItem value="stunden">Stunden</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">Anspruch:</span>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={a.urlaubsanspruch ?? ""}
                        onChange={(e) => updateAssignmentVacation(i, "urlaubsanspruch", e.target.value)}
                        className="h-7 text-xs w-20"
                        placeholder="-"
                      />
                      <span className="text-muted-foreground">Rest:</span>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={a.resturlaub ?? ""}
                        onChange={(e) => updateAssignmentVacation(i, "resturlaub", e.target.value)}
                        className="h-7 text-xs w-20"
                        placeholder="-"
                      />
                      <span className="text-muted-foreground">Stichtag:</span>
                      <Input
                        type="date"
                        value={a.stichtag ?? ""}
                        onChange={(e) => updateAssignmentVacation(i, "stichtag", e.target.value)}
                        className="h-7 text-xs w-36"
                      />
                      {a.urlaubsanspruch == null && a.resturlaub == null && (
                        <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800">
                          Nicht erkannt — bitte ergaenzen
                        </Badge>
                      )}
                    </div>
                    {/* Thumbnails */}
                    <div className="flex gap-1 mt-2 overflow-x-auto">
                      {a.pages.map((pageIdx) => {
                        const thumb = pageThumbnails.get(pageIdx);
                        return thumb ? (
                          <div key={pageIdx} className="relative group flex-shrink-0">
                            <img
                              src={thumb}
                              alt={`Seite ${pageIdx + 1}`}
                              className="h-24 w-auto rounded border border-gray-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => openLightbox(pageIdx, a.pages)}
                            />
                            <button
                              className="absolute top-0.5 right-0.5 hidden group-hover:flex w-4 h-4 bg-red-500 text-white rounded-full text-xs items-center justify-center leading-none"
                              onClick={(e) => { e.stopPropagation(); removePage(i, pageIdx); }}
                              title="Seite entfernen"
                            >
                              ×
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}

                {unassignedPages.length > 0 && (
                  <div className="p-3 border rounded-lg bg-gray-50 border-gray-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Nicht zugeordnete Seiten</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {unassignedPages.map((pageIdx) => (
                        <div key={pageIdx} className="flex flex-col items-center gap-1">
                          <img
                            src={pageThumbnails.get(pageIdx)}
                            alt={`Seite ${pageIdx + 1}`}
                            className="h-20 w-auto rounded border border-gray-300 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => openLightbox(pageIdx, unassignedPages)}
                          />
                          <Select onValueChange={(v) => assignUnassignedPage(pageIdx, v)}>
                            <SelectTrigger className="w-32 h-6 text-xs">
                              <SelectValue placeholder="Zuordnen..." />
                            </SelectTrigger>
                            <SelectContent>
                              {assignments.map((a, idx) => (
                                <SelectItem key={idx} value={String(idx)}>
                                  {a.employee_name || `Eintrag ${idx + 1}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Zurück
                </Button>
                <Button onClick={handleSave} disabled={validCount === 0}>
                  <Send className="w-4 h-4 mr-2" />
                  {validCount} Lohnzettel verteilen
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Saving progress */}
          {step === 3 && (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-3">
                {saving ? (
                  <>
                    <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
                    <p className="font-medium">Lohnzettel werden verteilt...</p>
                    <Progress value={progress} className="w-full" />
                    <p className="text-sm text-muted-foreground">{progress}%</p>
                  </>
                ) : (
                  <>
                    <Check className="w-10 h-10 mx-auto text-green-600" />
                    <p className="font-medium text-green-700">Alle Lohnzettel verteilt!</p>
                    <p className="text-sm text-muted-foreground">
                      {validCount} Mitarbeiter wurden benachrichtigt.
                    </p>
                    <Button onClick={() => onOpenChange(false)} className="mt-4">
                      Schließen
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox — separater Dialog */}
      <Dialog open={!!lightboxPage} onOpenChange={(v) => { if (!v) setLightboxPage(null); }}>
        <DialogContent className="max-w-3xl flex flex-col items-center gap-4 p-6">
          {lightboxPage && (
            <>
              <img
                src={pageFullImages.get(lightboxPage.pageIdx) ?? pageThumbnails.get(lightboxPage.pageIdx)}
                alt={`Seite ${lightboxPage.pageIdx + 1}`}
                className="max-h-[75vh] w-auto rounded shadow-xl"
              />
              <p className="text-sm text-muted-foreground">Seite {lightboxPage.pageIdx + 1}</p>
              {lightboxPage.pages.length > 1 && (
                <div className="flex gap-2">
                  {lightboxPage.pages.map((p) => (
                    <button
                      key={p}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        p === lightboxPage.pageIdx ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                      }`}
                      onClick={() => openLightbox(p, lightboxPage.pages)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
