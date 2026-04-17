import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Camera, Trash2, FileText, CheckCircle2, AlertTriangle, Pencil } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultProjectId?: string;
}

type Project = { id: string; name: string; plz: string | null; baustellenart: string | null };

export function ZettelUploadDialog({ open, onOpenChange, onSuccess, defaultProjectId }: Props) {
  const { toast } = useToast();
  const zettelInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [reportType, setReportType] = useState<"tagesbericht" | "regiebericht" | "zwischenbericht">("tagesbericht");
  const [datum, setDatum] = useState(format(new Date(), "yyyy-MM-dd"));

  const [zettelFile, setZettelFile] = useState<File | null>(null);
  const [zettelPreview, setZettelPreview] = useState<string | null>(null);

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"form" | "sign">("form");

  // Projekte laden
  useEffect(() => {
    if (!open) return;
    const fetchProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, plz, baustellenart")
        .eq("status", "aktiv")
        .order("name");
      if (data) setProjects(data as Project[]);
    };
    fetchProjects();
  }, [open]);

  // Namen des eingeloggten Mitarbeiters vorbelegen
  useEffect(() => {
    if (!open) return;
    const loadName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: emp } = await supabase
        .from("employees")
        .select("vorname, nachname")
        .eq("user_id", user.id)
        .maybeSingle();
      if (emp) setSignatureName(`${emp.vorname} ${emp.nachname}`.trim());
    };
    loadName();
  }, [open]);

  // Auto-Berichtstyp je Baustellenart
  useEffect(() => {
    const proj = projects.find(p => p.id === projectId);
    if (proj?.baustellenart === "regie") setReportType("regiebericht");
    else if (proj?.baustellenart === "pauschale") setReportType("tagesbericht");
  }, [projectId, projects]);

  const resetForm = () => {
    setProjectId(defaultProjectId || "");
    setReportType("tagesbericht");
    setDatum(format(new Date(), "yyyy-MM-dd"));
    setZettelFile(null);
    setZettelPreview(null);
    setPhotos([]);
    setPhotoPreviews([]);
    setSignatureData(null);
    setStep("form");
    setSaving(false);
  };

  const handleZettelSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZettelFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setZettelPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setZettelPreview(null);
    }
    e.target.value = "";
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPhotos = [...photos, ...files].slice(0, 4);
    setPhotos(newPhotos);

    // Previews generieren
    const newPreviews: string[] = [...photoPreviews];
    files.forEach((file) => {
      if (newPreviews.length >= 4) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews.push(ev.target?.result as string);
        if (newPreviews.length === newPhotos.length) {
          setPhotoPreviews([...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const canProceedToSign = (): boolean => {
    if (!projectId) return false;
    if (!zettelFile) return false;
    if (photos.length < 4) return false;
    return true;
  };

  const handleFinalSave = async () => {
    if (!signatureData || !signatureName.trim()) {
      toast({ variant: "destructive", title: "Unterschrift fehlt" });
      return;
    }
    if (!projectId || !zettelFile || photos.length < 4) {
      toast({ variant: "destructive", title: "Unvollständig", description: "Alle Felder erforderlich" });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      // 1. Report erstellen
      const { data: report, error: insertError } = await supabase
        .from("daily_reports")
        .insert({
          user_id: user.id,
          project_id: projectId,
          report_type: reportType,
          datum,
          status: "gesendet",
          ist_zettel_upload: true,
          unterschrift_kunde: signatureData,
          unterschrift_name: signatureName.trim(),
          unterschrift_am: new Date().toISOString(),
          beschreibung: "Handgeschriebener Zettel - siehe Upload",
        })
        .select()
        .single();

      if (insertError || !report) throw insertError || new Error("Report konnte nicht erstellt werden");

      // 2. Zettel hochladen
      const zettelExt = zettelFile.name.split(".").pop() || "jpg";
      const zettelPath = `${report.id}/_zettel_${Date.now()}.${zettelExt}`;
      const { error: zettelErr } = await supabase.storage
        .from("daily-report-photos")
        .upload(zettelPath, zettelFile);
      if (zettelErr) throw zettelErr;

      // 3. Zettel-URL speichern
      await supabase.from("daily_reports")
        .update({ zettel_scan_url: zettelPath })
        .eq("id", report.id);

      // 4. Fotos hochladen
      for (const file of photos) {
        const ext = file.name.split(".").pop() || "jpg";
        const photoPath = `${report.id}/${crypto.randomUUID()}.${ext}`;
        const { error: photoErr } = await supabase.storage
          .from("daily-report-photos")
          .upload(photoPath, file);
        if (!photoErr) {
          await supabase.from("daily_report_photos").insert({
            daily_report_id: report.id,
            user_id: user.id,
            file_path: photoPath,
            file_name: file.name,
          });
        }
      }

      toast({ title: "Zettel gespeichert", description: `${reportType} vom ${format(new Date(datum), "dd.MM.yyyy")}` });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err?.message || "Unbekannter Fehler" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) { resetForm(); onOpenChange(false); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {step === "form" ? "Handschriftlichen Bericht hochladen" : "Unterschrift"}
          </DialogTitle>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            {/* Berichtstyp */}
            <div>
              <Label>Berichtstyp *</Label>
              <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tagesbericht">Tagesbericht</SelectItem>
                  <SelectItem value="regiebericht">Regiebericht</SelectItem>
                  <SelectItem value="zwischenbericht">Zwischenbericht</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Projekt */}
            <div>
              <Label>Projekt *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} {p.plz ? `(${p.plz})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Datum */}
            <div>
              <Label>Datum *</Label>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>

            {/* Zettel-Upload */}
            <div>
              <Label>Zettel (Foto oder PDF) *</Label>
              <input
                ref={zettelInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleZettelSelect}
                className="hidden"
              />
              {!zettelFile ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-24 border-dashed"
                  onClick={() => zettelInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Camera className="h-6 w-6" />
                    <span className="text-xs">Zettel fotografieren oder hochladen</span>
                  </div>
                </Button>
              ) : (
                <div className="relative border rounded-lg p-2">
                  {zettelPreview ? (
                    <img src={zettelPreview} alt="Zettel" className="w-full h-32 object-contain" />
                  ) : (
                    <div className="flex items-center gap-2 p-2">
                      <FileText className="h-5 w-5" />
                      <span className="text-sm truncate">{zettelFile.name}</span>
                    </div>
                  )}
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-1 right-1 h-7 w-7"
                    onClick={() => { setZettelFile(null); setZettelPreview(null); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* 4 Fotos */}
            <div>
              <Label>Baustellenfotos ({photos.length}/4) *</Label>
              <p className="text-xs text-muted-foreground mb-2">Mindestens 4 Fotos von der Baustelle erforderlich</p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <div className="grid grid-cols-4 gap-2">
                {photoPreviews.map((preview, idx) => (
                  <div key={idx} className="relative aspect-square border rounded overflow-hidden">
                    <img src={preview} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 h-5 w-5 bg-destructive text-white rounded-full flex items-center justify-center"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed rounded flex items-center justify-center hover:bg-muted/50"
                  >
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            <DialogFooter className="flex-row justify-between gap-2">
              <div className="flex-1">
                {!canProceedToSign() && (
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {!projectId && "Projekt wählen · "}
                    {!zettelFile && "Zettel hochladen · "}
                    {photos.length < 4 && `${4 - photos.length} Foto(s) fehlt`}
                  </div>
                )}
              </div>
              <Button onClick={() => setStep("sign")} disabled={!canProceedToSign()}>
                <Pencil className="h-4 w-4 mr-1" /> Weiter - Unterschreiben
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "sign" && (
          <div className="space-y-4">
            <div>
              <Label>Name des Mitarbeiters *</Label>
              <Input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Vor- und Nachname"
              />
            </div>
            <div>
              <Label>Unterschrift *</Label>
              <div className="border rounded-lg overflow-hidden mt-1">
                <SignaturePad onSignatureChange={setSignatureData} width={400} height={150} />
              </div>
            </div>
            <DialogFooter className="flex-row justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("form")} disabled={saving}>
                Zurück
              </Button>
              <Button onClick={handleFinalSave} disabled={saving || !signatureData || !signatureName.trim()}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {saving ? "Speichert..." : "Speichern"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
