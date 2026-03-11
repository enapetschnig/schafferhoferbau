import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { Upload, Loader2, AlertTriangle, CheckCircle2, Trash2, FileText } from "lucide-react";

type DocType = "lieferschein" | "lagerlieferschein" | "rechnung";

type ExtractedData = {
  lieferant: string | null;
  datum: string | null;
  belegnummer: string | null;
  betrag: number | null;
  positionen: { material: string; menge: string; einheit: string; preis: string | null }[];
  qualitaet: "gut" | "mittel" | "schlecht";
};

interface DocumentCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DocumentCaptureDialog({ open, onOpenChange, onSuccess }: DocumentCaptureDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<DocType>("lieferschein");
  const [projects, setProjects] = useState<{ id: string; name: string; plz: string | null }[]>([]);
  const [projectId, setProjectId] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);

  // Editable fields
  const [lieferant, setLieferant] = useState("");
  const [dokumentDatum, setDokumentDatum] = useState("");
  const [belegnummer, setBelegnummer] = useState("");
  const [betrag, setBetrag] = useState("");

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (open) fetchProjects();
  }, [open, fetchProjects]);

  const resetForm = () => {
    setDocType("lieferschein");
    setProjectId("");
    setImageFile(null);
    setImagePreview(null);
    setUploadedUrl(null);
    setExtracted(null);
    setLieferant("");
    setDokumentDatum("");
    setBelegnummer("");
    setBetrag("");
    setSignatureData(null);
    setSignatureName("");
    setStep("photo");
    setExtracting(false);
    setSaving(false);
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
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelected(file);
  };

  const handleUploadAndExtract = async () => {
    if (!imageFile || !projectId) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte Foto und Projekt auswählen" });
      return;
    }

    setExtracting(true);

    try {
      // Upload to storage
      const ext = imageFile.name.split(".").pop() || "jpg";
      const filePath = `${projectId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("incoming-documents")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("incoming-documents")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      setUploadedUrl(publicUrl);

      // Call AI extraction
      const { data, error } = await supabase.functions.invoke("extract-document", {
        body: { imageUrl: publicUrl },
      });

      if (error) throw error;

      const result: ExtractedData = {
        lieferant: data?.lieferant || null,
        datum: data?.datum || null,
        belegnummer: data?.belegnummer || null,
        betrag: data?.betrag != null ? Number(data.betrag) : null,
        positionen: Array.isArray(data?.positionen) ? data.positionen : [],
        qualitaet: data?.qualitaet || "mittel",
      };

      setExtracted(result);
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
    if (!signatureData) {
      toast({ variant: "destructive", title: "Unterschrift fehlt", description: "Bitte unterschreiben Sie das Dokument." });
      return;
    }

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

    const { error } = await supabase.from("incoming_documents").insert({
      project_id: projectId,
      user_id: user.id,
      typ: docType,
      photo_url: uploadedUrl,
      lieferant: lieferant.trim() || null,
      dokument_datum: dokumentDatum || null,
      dokument_nummer: belegnummer.trim() || null,
      betrag: betrag ? parseFloat(betrag) : null,
      positionen: extracted?.positionen || [],
      unterschrift: signatureData,
      unterschrift_name: empName || null,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      setSaving(false);
      return;
    }

    toast({ title: "Gespeichert", description: "Dokument wurde erfolgreich erfasst" });
    resetForm();
    onOpenChange(false);
    onSuccess?.();
  };

  const DOC_TYPES: { value: DocType; label: string }[] = [
    { value: "lieferschein", label: "Lieferschein" },
    { value: "lagerlieferschein", label: "Lagerlieferschein" },
    { value: "rechnung", label: "Rechnung" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "photo" ? "Dokument erfassen" : step === "review" ? "Daten prüfen" : "Unterschrift"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Photo */}
          {step === "photo" && (
            <>
              {/* Document Type */}
              <div className="space-y-2">
                <Label>Dokumenttyp</Label>
                <div className="flex flex-wrap gap-2">
                  {DOC_TYPES.map((dt) => (
                    <Badge
                      key={dt.value}
                      variant={docType === dt.value ? "default" : "outline"}
                      className="cursor-pointer text-sm px-3 py-1.5 select-none"
                      onClick={() => setDocType(dt.value)}
                    >
                      {dt.label}
                    </Badge>
                  ))}
                </div>
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
              </div>

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
                <div className="col-span-2">
                  <Label>Betrag (€)</Label>
                  <Input type="number" step="0.01" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="0.00" />
                </div>
              </div>

              {/* Positions */}
              {extracted?.positionen && extracted.positionen.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Erkannte Positionen ({extracted.positionen.length})</Label>
                  <div className="border rounded-lg divide-y text-sm max-h-40 overflow-y-auto">
                    {extracted.positionen.map((pos, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                        <span className="truncate flex-1">{pos.material}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {pos.menge} {pos.einheit}
                          {pos.preis && ` · €${pos.preis}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
