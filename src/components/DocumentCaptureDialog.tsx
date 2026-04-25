import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { Upload, Loader2, AlertTriangle, CheckCircle2, Trash2, FileText, Plus } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type DocType = "lieferschein" | "lagerlieferschein" | "rechnung";

type ExtractedData = {
  lieferant: string | null;
  datum: string | null;
  belegnummer: string | null;
  betrag: number | null;
  positionen: { material: string; menge: string; einheit: string; preis: string | null; gesamtpreis: string | null }[];
  qualitaet: "gut" | "mittel" | "schlecht";
};

interface DocumentCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Optional: wird als "Alle Lieferscheine"-Shortcut oben angezeigt */
  onShowAll?: () => void;
  /** Optional: Projekt-ID das automatisch ausgewaehlt werden soll */
  defaultProjectId?: string;
  /** Optional: Dokumenttyp voreinstellen (umgeht die Auswahl im Dialog) */
  defaultDocType?: DocType;
  /** Optional: Foto-Step ueberspringen — direkt zur manuellen Eingabe */
  skipPhoto?: boolean;
}

export function DocumentCaptureDialog({ open, onOpenChange, onSuccess, onShowAll, defaultProjectId, defaultDocType, skipPhoto }: DocumentCaptureDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<DocType>("lieferschein");
  const [projects, setProjects] = useState<{ id: string; name: string; plz: string | null }[]>([]);
  const [projectId, setProjectId] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extraPages, setExtraPages] = useState<File[]>([]); // zusaetzliche Seiten fuer mehrseitige Lieferscheine
  const [warePhotos, setWarePhotos] = useState<File[]>([]); // optionale Fotos der Ware
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const extraPageInputRef = useRef<HTMLInputElement>(null);
  const warePhotoInputRef = useRef<HTMLInputElement>(null);

  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);

  // Editable positionen
  const [editPositionen, setEditPositionen] = useState<ExtractedData["positionen"]>([]);

  // Editable fields
  const [lieferant, setLieferant] = useState("");
  const [dokumentDatum, setDokumentDatum] = useState("");
  const [belegnummer, setBelegnummer] = useState("");
  const [betrag, setBetrag] = useState("");

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [saving, setSaving] = useState(false);
  const [istRetour, setIstRetour] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [step, setStep] = useState<"photo" | "review" | "sign">("photo");

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, plz")
      .in("status", ["aktiv", "in_planung"])
      .order("name");
    if (data) setProjects(data);
  }, []);

  useEffect(() => {
    if (open) {
      fetchProjects();
      if (defaultProjectId) setProjectId(defaultProjectId);
      if (defaultDocType) setDocType(defaultDocType);
      if (skipPhoto) setStep("review");
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        const admin = data?.role === "administrator";
        setIsAdmin(admin);
        // Non-Admin darf keine Rechnung erfassen - auf Lieferschein zwingen
        if (!admin && docType === "rechnung") setDocType("lieferschein");
      })();
    }
  }, [open, fetchProjects, defaultProjectId, defaultDocType, skipPhoto]);

  const resetForm = () => {
    setDocType("lieferschein");
    setProjectId("");
    setImageFile(null);
    setImagePreview(null);
    setExtraPages([]);
    setWarePhotos([]);
    setUploadedUrl(null);
    setExtracted(null);
    setEditPositionen([]);
    setLieferant("");
    setDokumentDatum("");
    setBelegnummer("");
    setBetrag("");
    setSignatureData(null);
    setSignatureName("");
    setStep("photo");
    setExtracting(false);
    setSaving(false);
    setIstRetour(false);
  };

  const handleFileSelected = (file: File) => {
    setImageFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
    // Fallback-Datum: Aufnahmedatum des Fotos vorbefuellen.
    // Wird von der KI-Extraktion ueberschrieben, wenn ein Datum im Dokument steht.
    if (!dokumentDatum && file.lastModified) {
      const lm = new Date(file.lastModified);
      setDokumentDatum(lm.toISOString().split("T")[0]);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelected(file);
  };

  const prepareImageForAI = (file: File): Promise<{ base64: string; mimeType: string; pdfText?: string }> =>
    new Promise((resolve, reject) => {
      const QUALITY = 0.85;

      const resizeAndExport = (src: HTMLCanvasElement | HTMLImageElement, maxW: number, maxH: number) => {
        let w = "naturalWidth" in src ? src.naturalWidth : src.width;
        let h = "naturalHeight" in src ? src.naturalHeight : src.height;
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
        if (h > maxH) { w = Math.round((w * maxH) / h); h = maxH; }
        const out = document.createElement("canvas");
        out.width = w; out.height = h;
        const ctx = out.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(src, 0, 0, w, h);
        const dataUrl = out.toDataURL("image/jpeg", QUALITY);
        resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
      };

      if (file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target!.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data }).promise;

            // Zuerst Textlayer versuchen (eingebetteter Text = perfekte Extraktion)
            const pageTexts: string[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              // Y-Position auswerten: Zeilenumbrüche einfügen wenn neue Zeile beginnt
              let lastY: number | null = null;
              const parts: string[] = [];
              for (const item of textContent.items as any[]) {
                const y = Math.round(item.transform[5]);
                if (lastY !== null && Math.abs(y - lastY) > 3) {
                  parts.push("\n");
                }
                parts.push(item.str);
                lastY = y;
              }
              const pageText = parts.join(" ").replace(/  +/g, " ").trim();
              pageTexts.push(`--- Seite ${i} ---\n${pageText}`);
            }
            const fullText = pageTexts.join("\n\n");

            if (fullText.trim().length > 100) {
              // PDF hat Textlayer → als Text senden (wie ChatGPT, 100% genau)
              resolve({ base64: "", mimeType: "application/pdf", pdfText: fullText });
              return;
            }

            // Kein Textlayer (gescannte PDF) → Fallback: kombiniertes JPEG
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
        // Image (JPEG, PNG, HEIC etc.): max 1500×1500px
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => resizeAndExport(img, 1500, 1500);
          img.src = e.target!.result as string;
        };
        reader.readAsDataURL(file);
      }
    });

  const handleUploadAndExtract = async () => {
    if (!imageFile || !projectId) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte Foto und Projekt auswählen" });
      return;
    }

    setExtracting(true);

    try {
      // 1. Upload to storage (for archiving)
      const ext = imageFile.name.split(".").pop() || "jpg";
      const filePath = `${projectId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("incoming-documents")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("incoming-documents")
        .getPublicUrl(filePath);

      setUploadedUrl(urlData.publicUrl);

      // 2. Prepare file for AI: PDF mit Textlayer → pdfText, sonst JPEG
      const prepared = await prepareImageForAI(imageFile);
      const invokeBody = prepared.pdfText
        ? { pdfText: prepared.pdfText }
        : { imageBase64: prepared.base64, mediaType: prepared.mimeType };

      // 3. Call AI extraction (SDK handles auth automatically)
      const { data, error: fnError } = await supabase.functions.invoke("extract-document", {
        body: { ...invokeBody, docType },
      });

      if (fnError) {
        let errMsg = fnError.message;
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) errMsg = body.error;
          if (body?.details) errMsg += " — " + body.details;
        } catch {}
        throw new Error(errMsg);
      }

      const rawPositionen: any[] = Array.isArray(data?.["Positionen"]) ? data["Positionen"] : [];
      const bruttoRaw = data?.["Betrag Brutto (€)"];
      const result: ExtractedData = {
        lieferant: data?.["Lieferant"] || null,
        datum: data?.["Datum"] || null,
        belegnummer: data?.["Belegnummer"] || null,
        betrag: bruttoRaw != null && bruttoRaw !== "nicht gefunden" && bruttoRaw !== ""
          ? Number(bruttoRaw) : null,
        positionen: rawPositionen.map((p: any) => ({
          material: p["Material"] ?? "",
          menge: p["Menge"] != null ? String(p["Menge"]) : "",
          einheit: p["Einheit"] ?? "",
          preis: p["Einzelpreis (€ netto)"] != null && p["Einzelpreis (€ netto)"] !== ""
            ? String(p["Einzelpreis (€ netto)"]) : null,
          gesamtpreis: p["Gesamt (€ netto)"] != null && p["Gesamt (€ netto)"] !== ""
            ? String(p["Gesamt (€ netto)"]) : null,
        })),
        qualitaet: "mittel",
      };

      setExtracted(result);
      setEditPositionen(result.positionen);
      setLieferant(result.lieferant || "");
      setDokumentDatum(result.datum || "");
      setBelegnummer(result.belegnummer || "");
      setBetrag(result.betrag != null ? result.betrag.toString() : "");

      if (result.qualitaet === "schlecht") {
        toast({
          variant: "destructive",
          title: "Schlechte Bildqualität",
          description: "Das Bild ist unscharf oder schlecht lesbar. Bitte fotografieren Sie das Dokument erneut.",
        });
      }

      setStep("review");
    } catch (err: any) {
      console.error("Extract error:", err);
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Analyse fehlgeschlagen" });
      // Still proceed to review with manual entry
      setStep("review");
    } finally {
      setExtracting(false);
    }
  };

  const handleRetakePhoto = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadedUrl(null);
    setExtracted(null);
    setStep("photo");
  };

  const handleSave = async () => {
    // Unterschrift ist optional - durch Upload ist Mitarbeiter-Zuordnung bereits gegeben
    if (!uploadedUrl) {
      toast({ variant: "destructive", title: "Fehler", description: "Kein Foto hochgeladen" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // Get employee name for signature
    let empName = signatureName;
    if (!empName) {
      const { data: emp } = await supabase
        .from("employees")
        .select("vorname, nachname")
        .eq("user_id", user.id)
        .single();
      if (emp) empName = `${emp.vorname} ${emp.nachname}`.trim();
    }

    // Upload extra pages
    const zusatzUrls: string[] = [];
    for (const file of extraPages) {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${projectId}/seite_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("incoming-documents")
        .upload(filePath, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("incoming-documents").getPublicUrl(filePath);
        zusatzUrls.push(urlData.publicUrl);
      }
    }

    // Upload Ware-Fotos
    const warenUrls: string[] = [];
    for (const file of warePhotos) {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${projectId}/ware_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("incoming-documents")
        .upload(filePath, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("incoming-documents").getPublicUrl(filePath);
        warenUrls.push(urlData.publicUrl);
      }
    }

    // Fallback: wenn KI kein Datum erkannt hat und der User auch nichts eingegeben hat,
    // nimm das Aufnahme-/Modifikationsdatum der Datei (typisch bei Handyfotos =
    // Aufnahmedatum). Liefert kein EXIF nötig, lastModified reicht in 95% der Faelle.
    const effectiveDatum = dokumentDatum
      ? dokumentDatum
      : imageFile
      ? new Date(imageFile.lastModified).toISOString().split("T")[0]
      : null;

    const { error } = await supabase.from("incoming_documents").insert({
      project_id: projectId,
      user_id: user.id,
      typ: docType,
      photo_url: uploadedUrl,
      lieferant: lieferant.trim() || null,
      dokument_datum: effectiveDatum,
      dokument_nummer: belegnummer.trim() || null,
      betrag: betrag ? parseFloat(betrag) : null,
      positionen: editPositionen.map(p => ({
        material: p.material,
        menge: p.menge,
        einheit: p.einheit,
        einzelpreis: p.preis || null,
        gesamtpreis: p.gesamtpreis || null,
      })),
      unterschrift: signatureData,
      unterschrift_name: empName || null,
      zusatz_seiten_urls: zusatzUrls.length > 0 ? zusatzUrls : null,
      waren_fotos_urls: warenUrls.length > 0 ? warenUrls : null,
      ist_retour: istRetour,
      // Retour bleibt "offen", normale auf "offen" (Default)
      status: "offen",
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      setSaving(false);
      return;
    }

    toast({ title: "Gespeichert", description: "Dokument erfasst - Sie können direkt das nächste aufnehmen" });
    onSuccess?.();
    // Zurueck zum Foto-Schritt fuer nächstes Dokument (Dialog bleibt offen)
    resetForm();
    setStep("photo");
  };

  // mainType: "lieferschein" or "rechnung" (Lagerlieferschein is a sub-option of lieferschein)
  const mainType = docType === "rechnung" ? "rechnung" : "lieferschein";
  const isLagerlieferschein = docType === "lagerlieferschein";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle>
              {step === "photo" ? "Dokument erfassen" : step === "review" ? "Daten prüfen" : "Unterschrift"}
            </DialogTitle>
            {onShowAll && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={onShowAll}
                title="Alle Lieferscheine ansehen"
              >
                Alle Lieferscheine
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Photo */}
          {step === "photo" && (
            <>
              {/* Document Type */}
              <div className="space-y-2">
                <Label>Was möchtest du erfassen?</Label>
                <div className={`grid ${isAdmin ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
                  <button
                    type="button"
                    onClick={() => setDocType("lieferschein")}
                    className={`rounded-xl border-2 p-4 text-center transition-all ${
                      mainType === "lieferschein"
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <div className="text-2xl mb-1">📦</div>
                    <div className="text-sm font-medium">Lieferschein</div>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDocType("rechnung")}
                      className={`rounded-xl border-2 p-4 text-center transition-all ${
                        mainType === "rechnung"
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <div className="text-2xl mb-1">🧾</div>
                      <div className="text-sm font-medium">Rechnung</div>
                    </button>
                  )}
                </div>
                {mainType === "lieferschein" && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="lager-check"
                        checked={isLagerlieferschein}
                        onCheckedChange={(checked) =>
                          setDocType(checked ? "lagerlieferschein" : "lieferschein")
                        }
                      />
                      <label htmlFor="lager-check" className="text-sm text-muted-foreground cursor-pointer select-none">
                        Lagerbewegung (Lagerlieferschein)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="retour-check"
                        checked={istRetour}
                        onCheckedChange={(checked) => setIstRetour(!!checked)}
                      />
                      <label htmlFor="retour-check" className="text-sm text-muted-foreground cursor-pointer select-none">
                        Retourlieferschein (Ware geht zurück ins Lager oder auf andere Baustelle)
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Project */}
              <div className="space-y-2">
                <Label>Projekt / Baustelle *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Projekt auswählen" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}{p.plz ? ` (${p.plz})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Photo */}
              <div className="space-y-2">
                <Label>Foto des Dokuments *</Label>
                {imageFile ? (
                  <div className="relative">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Vorschau" className="w-full rounded-lg border max-h-48 object-contain bg-muted" />
                    ) : (
                      <div className="w-full rounded-lg border bg-muted p-4 flex items-center gap-3">
                        <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{imageFile.name}</span>
                      </div>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelected(file);
                    }}
                  >
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Datei auswählen, fotografieren oder hierher ziehen</p>
                    <p className="text-xs text-muted-foreground mt-1">Bilder, PDFs und Dokumente werden unterstützt</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.jpg,.jpeg,.png,.heic"
                  className="hidden"
                  onChange={handlePhotoCapture}
                />

                {/* Weitere Seiten */}
                {imageFile && (
                  <div className="space-y-1.5">
                    {extraPages.length > 0 && (
                      <div className="space-y-1">
                        {extraPages.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 p-1.5 bg-muted/40 rounded text-xs">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate">Seite {i + 2}: {f.name}</span>
                            <button
                              type="button"
                              className="text-destructive"
                              onClick={() => setExtraPages(extraPages.filter((_, idx) => idx !== i))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      ref={extraPageInputRef}
                      type="file"
                      accept="image/*,.pdf,.jpg,.jpeg,.png,.heic"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) setExtraPages(prev => [...prev, ...files]);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => extraPageInputRef.current?.click()}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {extraPages.length === 0 ? "Weitere Seiten hinzufügen" : `+ Noch eine Seite (${extraPages.length + 1} bisher)`}
                    </Button>
                  </div>
                )}
              </div>

              {/* Fotos der Ware (optional) */}
              {imageFile && docType !== "rechnung" && (
                <div className="space-y-2">
                  <Label className="text-sm">
                    Fotos der Ware <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  {warePhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {warePhotos.map((f, i) => (
                        <div key={i} className="relative group aspect-square">
                          <img
                            src={URL.createObjectURL(f)}
                            alt=""
                            className="w-full h-full object-cover rounded border"
                          />
                          <button
                            type="button"
                            className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setWarePhotos(warePhotos.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={warePhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) setWarePhotos(prev => [...prev, ...files]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => warePhotoInputRef.current?.click()}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {warePhotos.length === 0 ? "Fotos der gelieferten Ware hinzufügen" : `+ Noch ein Foto (${warePhotos.length} bisher)`}
                  </Button>
                </div>
              )}

              <Button
                onClick={handleUploadAndExtract}
                disabled={!imageFile || !projectId || extracting}
                className="w-full"
              >
                {extracting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    KI analysiert Dokument...
                  </>
                ) : (
                  "Weiter — Dokument analysieren"
                )}
              </Button>
            </>
          )}

          {/* Step 2: Review extracted data */}
          {step === "review" && (
            <>
              {/* Quality warning */}
              {extracted?.qualitaet === "schlecht" && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">Schlechte Bildqualität</p>
                    <p className="text-xs text-red-600 dark:text-red-400">Das Bild ist unscharf oder schlecht lesbar. Bitte fotografieren Sie das Dokument erneut.</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={handleRetakePhoto}>
                      Neu fotografieren
                    </Button>
                  </div>
                </div>
              )}

              {extracted?.qualitaet === "gut" && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-green-700 dark:text-green-300">Gute Bildqualität — Daten erfolgreich erkannt</p>
                </div>
              )}

              {/* Photo thumbnail */}
              {imagePreview && (
                <img src={uploadedUrl || imagePreview} alt="Dokument" className="w-full max-h-32 object-contain rounded border bg-muted" />
              )}

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Lieferant</Label>
                  <Input value={lieferant} onChange={(e) => setLieferant(e.target.value)} placeholder="z.B. Lagerhaus Weiz" />
                </div>
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={dokumentDatum} onChange={(e) => setDokumentDatum(e.target.value)} />
                </div>
                <div>
                  <Label>Belegnummer</Label>
                  <Input value={belegnummer} onChange={(e) => setBelegnummer(e.target.value)} placeholder="z.B. LS-1234" />
                </div>
                {docType === "rechnung" && (
                  <div className="col-span-2">
                    <Label>Betrag (€)</Label>
                    <Input type="number" step="0.01" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0.00" />
                  </div>
                )}
              </div>

              {/* Positions — editable */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Positionen ({editPositionen.length})
                </Label>
                <div className="border rounded-lg divide-y text-sm max-h-64 overflow-y-auto">
                  {editPositionen.length === 0 && (
                    <p className="text-muted-foreground text-xs px-3 py-2">Keine Positionen erkannt — manuell hinzufügen</p>
                  )}
                  {editPositionen.map((pos, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 px-2 py-1.5">
                      <Input
                        value={pos.material}
                        onChange={(e) => {
                          const next = [...editPositionen];
                          next[idx] = { ...next[idx], material: e.target.value };
                          setEditPositionen(next);
                        }}
                        className="flex-1 h-7 text-xs"
                        placeholder="Material"
                      />
                      <Input
                        value={pos.menge}
                        onChange={(e) => {
                          const next = [...editPositionen];
                          next[idx] = { ...next[idx], menge: e.target.value };
                          setEditPositionen(next);
                        }}
                        className="w-16 h-7 text-xs"
                        placeholder="Menge"
                      />
                      <Input
                        value={pos.einheit}
                        onChange={(e) => {
                          const next = [...editPositionen];
                          next[idx] = { ...next[idx], einheit: e.target.value };
                          setEditPositionen(next);
                        }}
                        className="w-14 h-7 text-xs"
                        placeholder="Einh."
                      />
                      <button
                        type="button"
                        onClick={() => setEditPositionen(editPositionen.filter((_, i) => i !== idx))}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => setEditPositionen([...editPositionen, { material: "", menge: "", einheit: "", preis: null, gesamtpreis: null }])}
                >
                  <Plus className="w-3 h-3 mr-1" /> Zeile hinzufügen
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRetakePhoto} className="flex-1">
                  Zurück
                </Button>
                <Button onClick={() => setStep("sign")} className="flex-1">
                  Weiter — Unterschreiben
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Signature */}
          {step === "sign" && (
            <>
              <div>
                <Label>Name des Mitarbeiters</Label>
                <Input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Vor- und Nachname"
                />
              </div>

              <div>
                <Label>Unterschrift *</Label>
                <SignaturePad
                  onSignatureChange={(data) => setSignatureData(data)}
                  width={400}
                  height={180}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("review")} className="flex-1">
                  Zurück
                </Button>
                <Button onClick={handleSave} disabled={saving || !signatureData} className="flex-1">
                  {saving ? "Speichere..." : "Dokument speichern"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
