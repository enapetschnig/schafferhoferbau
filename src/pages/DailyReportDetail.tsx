import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Upload, Trash2, Pencil, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SafetyChecklist, DEFAULT_SAFETY_ITEMS, type SafetyItem } from "@/components/SafetyChecklist";
import { DailyReportForm } from "@/components/DailyReportForm";
import { SignaturePad } from "@/components/SignaturePad";
import { SerialPhotoCapture } from "@/components/SerialPhotoCapture";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { generateDailyReportPDF } from "@/lib/generateDailyReportPDF";

const WETTER_LABELS: Record<string, string> = {
  sonnig: "☀️ Sonnig", bewoelkt: "☁️ Bewölkt", regen: "🌧️ Regen",
  schnee: "❄️ Schnee", wind: "💨 Wind", frost: "🥶 Frost",
};

const GESCHOSS_LABELS: Record<string, string> = {
  aussen: "Außen", keller: "Keller", eg: "EG", og: "OG", dg: "DG",
};

type DailyReport = {
  id: string;
  user_id: string;
  project_id: string;
  report_type: string;
  datum: string;
  temperatur_min: number | null;
  temperatur_max: number | null;
  wetter: string[] | null;
  geschoss: string[] | null;
  beschreibung: string;
  notizen: string | null;
  sicherheitscheckliste: any;
  sicherheit_bestaetigt: boolean;
  unterschrift_kunde: string | null;
  unterschrift_am: string | null;
  unterschrift_name: string | null;
  status: string;
  created_at: string;
  projects: { name: string; plz: string | null; adresse: string | null } | null;
};

type Activity = { id: string; geschoss: string; beschreibung: string; sort_order: number };
type Photo = { id: string; file_path: string; file_name: string };
type Worker = { user_id: string; name: string };

export default function DailyReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [report, setReport] = useState<DailyReport | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [serialCapture, setSerialCapture] = useState(false);
  const [showSerialDialog, setShowSerialDialog] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);

  // Signature state
  const [safetyItems, setSafetyItems] = useState<SafetyItem[]>(DEFAULT_SAFETY_ITEMS);
  const [signatureName, setSignatureName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!id || !window.confirm("Bericht wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    if (photos.length > 0) {
      await supabase.storage.from("daily-report-photos").remove(photos.map(p => p.file_path));
    }
    const { error } = await supabase.from("daily_reports").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Fehler beim Löschen", description: error.message });
      return;
    }
    toast({ title: "Gelöscht", description: "Bericht wurde gelöscht." });
    navigate("/daily-reports");
  };

  const openSignDialog = async () => {
    // Bauherr 1 oder 2 als Standard-Unterzeichner vorauswählen
    if (report?.project_id) {
      const { data: proj } = await supabase
        .from("projects")
        .select("bauherr, bauherr2")
        .eq("id", report.project_id)
        .maybeSingle();
      if (proj?.bauherr) {
        setSignatureName(proj.bauherr);
      } else if (proj?.bauherr2) {
        setSignatureName(proj.bauherr2);
      }
    }
    // Fallback: eingeloggter Mitarbeiter
    if (!signatureName) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: emp } = await supabase
          .from("employees")
          .select("vorname, nachname")
          .eq("user_id", user.id)
          .maybeSingle();
        if (emp) setSignatureName(`${emp.vorname} ${emp.nachname}`.trim());
      }
    }
    setShowSignDialog(true);
  };

  const fetchReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data } = await supabase
      .from("daily_reports")
      .select("*, projects(name, plz, adresse)")
      .eq("id", id)
      .single();

    if (data) {
      setReport(data as any);
      if (data.sicherheitscheckliste && Array.isArray(data.sicherheitscheckliste) && data.sicherheitscheckliste.length > 0) {
        setSafetyItems(data.sicherheitscheckliste as SafetyItem[]);
      }
    }

    const { data: acts } = await supabase
      .from("daily_report_activities")
      .select("*")
      .eq("daily_report_id", id)
      .order("sort_order");
    if (acts) setActivities(acts);

    const { data: pics } = await supabase
      .from("daily_report_photos")
      .select("*")
      .eq("daily_report_id", id)
      .order("created_at");
    if (pics) setPhotos(pics);

    // Fetch workers
    const { data: workerData } = await supabase
      .from("daily_report_workers")
      .select("user_id")
      .eq("daily_report_id", id);
    if (workerData && workerData.length > 0) {
      const userIds = workerData.map((w: any) => w.user_id);
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .in("user_id", userIds);
      if (empData) {
        setWorkers(empData.map((e: any) => ({ user_id: e.user_id, name: `${e.vorname} ${e.nachname}`.trim() })));
      }
    } else {
      setWorkers([]);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // Auto-Rotation: Bild auf Canvas zeichnen mit korrekter Orientierung
  const autoRotateImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // CSS-basierte EXIF-Orientierung wird von modernen Browsern automatisch angewendet
        // Wir zeichnen das Bild auf Canvas um die Orientierung zu fixieren
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.9);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !id) return;

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    for (const file of Array.from(files)) {
      // Auto-Rotation anwenden
      const rotatedBlob = file.type.startsWith("image/") ? await autoRotateImage(file) : file;
      const ext = file.name.split(".").pop();
      const filePath = `${id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("daily-report-photos")
        .upload(filePath, rotatedBlob);

      if (uploadError) {
        toast({ variant: "destructive", title: "Upload-Fehler", description: uploadError.message });
        continue;
      }

      await supabase.from("daily_report_photos").insert({
        daily_report_id: id,
        user_id: user.id,
        file_path: filePath,
        file_name: file.name,
      });

      // Foto zusätzlich im Projekt-Foto-Ordner spiegeln, damit es im
      // Projekt-Bereich unter "Fotos" auftaucht.
      if (report?.project_id && file.type.startsWith("image/")) {
        const photoPath = `${report.project_id}/${Date.now()}_${file.name}`;
        const { error: mirrorErr } = await supabase.storage
          .from("project-photos")
          .upload(photoPath, rotatedBlob, { upsert: false });
        if (!mirrorErr) {
          await supabase.from("documents").insert({
            name: file.name,
            project_id: report.project_id,
            typ: "photos",
            file_url: photoPath,
            user_id: user.id,
            archived: false,
          });
        }
      }
    }

    setUploading(false);
    fetchReport();
    e.target.value = "";

    // Serienaufnahme: nach Upload automatisch Kamera wieder oeffnen
    if (serialCapture && photoInputRef.current) {
      setTimeout(() => photoInputRef.current?.click(), 300);
    }
  };

  const handleSerialUpload = async (files: File[]) => {
    if (!id || files.length === 0) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    let uploaded = 0;
    for (const file of files) {
      const rotatedBlob = file.type.startsWith("image/") ? await autoRotateImage(file) : file;
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("daily-report-photos")
        .upload(filePath, rotatedBlob);

      if (uploadError) {
        toast({ variant: "destructive", title: "Upload-Fehler", description: uploadError.message });
        continue;
      }

      await supabase.from("daily_report_photos").insert({
        daily_report_id: id,
        user_id: user.id,
        file_path: filePath,
        file_name: file.name,
      });
      uploaded++;
    }

    setUploading(false);
    toast({ title: `${uploaded} Foto${uploaded === 1 ? "" : "s"} hochgeladen` });
    fetchReport();
  };

  const deletePhoto = async (photo: Photo) => {
    await supabase.storage.from("daily-report-photos").remove([photo.file_path]);
    await supabase.from("daily_report_photos").delete().eq("id", photo.id);
    fetchReport();
  };

  const getPhotoUrl = (filePath: string) => {
    const { data } = supabase.storage.from("daily-report-photos").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSign = async () => {
    if (!report || !id) return;

    // Validate
    if (report.report_type === "tagesbericht" && photos.length < 4) {
      toast({ variant: "destructive", title: "Fotos fehlen", description: "Mindestens 4 Fotos sind für einen Bericht erforderlich." });
      return;
    }

    // Alle Punkte muessen bewertet sein (gruen oder rot) — gemischt erlaubt.
    const allRated = safetyItems.every((item) => {
      const s = item.status;
      if (s === "ok" || s === "nok") return true;
      // Legacy-Fallback: falls noch alte Daten ohne status, aber checked=true
      if (s === undefined && item.checked === true) return true;
      return false;
    });
    if (!allRated) {
      toast({ variant: "destructive", title: "Sicherheitscheckliste", description: "Alle Punkte müssen bewertet werden (grün oder rot)." });
      return;
    }

    if (!signatureData) {
      toast({ variant: "destructive", title: "Unterschrift fehlt", description: "Bitte unterschreiben Sie den Bericht." });
      return;
    }

    const { error } = await supabase
      .from("daily_reports")
      .update({
        unterschrift_kunde: signatureData,
        unterschrift_am: new Date().toISOString(),
        unterschrift_name: signatureName.trim() || null,
        sicherheitscheckliste: safetyItems,
        sicherheit_bestaetigt: true,
        status: "gesendet",
      })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Unterschrieben", description: "Bericht wurde erfolgreich unterschrieben." });
      setShowSignDialog(false);
      fetchReport();
    }
  };

  const handleDownloadPDF = async () => {
    if (!report) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    await generateDailyReportPDF(
      {
        report_type: report.report_type,
        datum: report.datum,
        temperatur_min: report.temperatur_min,
        temperatur_max: report.temperatur_max,
        wetter: report.wetter,
        beschreibung: report.beschreibung,
        notizen: report.notizen,
        sicherheitscheckliste: report.sicherheitscheckliste,
        sicherheit_bestaetigt: report.sicherheit_bestaetigt,
        unterschrift_kunde: report.unterschrift_kunde,
        unterschrift_am: report.unterschrift_am,
        unterschrift_name: report.unterschrift_name,
        project: report.projects ? { name: report.projects.name, adresse: report.projects.adresse, plz: report.projects.plz } : null,
      },
      activities,
      photos,
      supabaseUrl
    );
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Lade...</p></div>;
  if (!report) return <div className="flex items-center justify-center min-h-screen"><p>Bericht nicht gefunden</p></div>;

  const isSigned = !!report.unterschrift_kunde;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/daily-reports")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {report.report_type === "tagesbericht" ? "Tagesbericht"
            : report.report_type === "regiebericht" ? "Regiebericht"
            : "Zwischenbericht"}
        </h1>
        <Badge variant={isSigned ? "default" : "outline"}>
          {report.status === "offen" ? "Offen" : report.status === "gesendet" ? "Gesendet" : "Abgeschlossen"}
        </Badge>
      </div>

      <div className="space-y-6">
        {/* Project & Date */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{(report.projects as any)?.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Datum:</strong> {format(new Date(report.datum), "EEEE, dd. MMMM yyyy", { locale: de })}</p>
            {(report.projects as any)?.adresse && (
              <p><strong>Adresse:</strong> {(report.projects as any).adresse} {(report.projects as any).plz}</p>
            )}
          </CardContent>
        </Card>

        {/* Weather */}
        {((report.wetter && report.wetter.length > 0) || report.temperatur_min != null) && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Wetter</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {report.wetter && report.wetter.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {report.wetter.map((w) => (
                    <Badge key={w} variant="secondary">{WETTER_LABELS[w] || w}</Badge>
                  ))}
                </div>
              )}
              {(report.temperatur_min != null || report.temperatur_max != null) && (
                <p className="text-sm">
                  Temperatur: {report.temperatur_min ?? "–"}° / {report.temperatur_max ?? "–"}°C
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activities */}
        {activities.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Tätigkeiten</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activities.map((act) => (
                  <div key={act.id} className="flex gap-3">
                    <Badge variant="outline" className="shrink-0">{GESCHOSS_LABELS[act.geschoss] || act.geschoss}</Badge>
                    <p className="text-sm">{act.beschreibung}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        {report.beschreibung && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Beschreibung</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{report.beschreibung}</p>
              {report.notizen && (
                <p className="text-sm text-muted-foreground mt-2">{report.notizen}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Anwesende Mitarbeiter */}
        {workers.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Anwesende Mitarbeiter</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {workers.map((w) => (
                  <Badge key={w.user_id} variant="secondary">{w.name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Photos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Fotos ({photos.length})
                {report.report_type === "tagesbericht" && photos.length < 4 && (
                  <span className="text-sm text-destructive font-normal ml-2">
                    (mind. 4 erforderlich)
                  </span>
                )}
              </CardTitle>
              {!isSigned && (
                <div className="flex gap-2 flex-wrap">
                  <label className="cursor-pointer">
                    <Button variant="outline" size="sm" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-1" />
                        {uploading ? "Lade hoch..." : "Foto hochladen"}
                      </span>
                    </Button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={uploading}
                    />
                  </label>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowSerialDialog(true)}
                    disabled={uploading}
                  >
                    <Camera className="w-4 h-4 mr-1" />
                    Serienaufnahme
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Camera className="w-8 h-8 mb-2" />
                <p className="text-sm">Noch keine Fotos</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <img
                      src={getPhotoUrl(photo.file_path)}
                      alt={photo.file_name}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    {!isSigned && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deletePhoto(photo)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signature section */}
        {isSigned ? (
          <Card>
            <CardHeader><CardTitle className="text-lg">Unterschrift</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <img src={report.unterschrift_kunde!} alt="Unterschrift" className="max-w-xs border rounded" />
              {report.unterschrift_name && (
                <p className="text-sm">{report.unterschrift_name}</p>
              )}
              {report.unterschrift_am && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(report.unterschrift_am), "dd.MM.yyyy HH:mm", { locale: de })}
                </p>
              )}
              {report.sicherheit_bestaetigt && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Sicherheitscheckliste bestätigt
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="mt-3">
                <Download className="w-4 h-4 mr-2" /> PDF herunterladen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowEditForm(true)}>
              <Pencil className="w-4 h-4 mr-2" /> Bearbeiten
            </Button>
            <Button onClick={openSignDialog}>
              Unterschreiben & Absenden
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Löschen
            </Button>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <DailyReportForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        onSuccess={fetchReport}
        editData={report ? {
          id: report.id,
          project_id: report.project_id,
          report_type: report.report_type,
          datum: report.datum,
          temperatur_min: report.temperatur_min,
          temperatur_max: report.temperatur_max,
          wetter: report.wetter,
          geschoss: report.geschoss,
          beschreibung: report.beschreibung,
          notizen: report.notizen,
        } : null}
      />

      {/* Signature Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bericht unterschreiben</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <SafetyChecklist items={safetyItems} onChange={setSafetyItems} />

            {report.report_type === "tagesbericht" && photos.length < 4 && (
              <p className="text-sm text-destructive font-medium">
                Es fehlen noch {4 - photos.length} Foto(s). Mindestens 4 Fotos sind erforderlich.
              </p>
            )}

            <div>
              <Label>Name des Unterzeichners</Label>
              <Input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Vor- und Nachname"
              />
            </div>

            <div>
              <Label>Unterschrift</Label>
              <SignaturePad
                onSignatureChange={(data) => setSignatureData(data)}
                width={400}
                height={200}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSignDialog(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleSign}>
                Unterschreiben & Absenden
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Serienaufnahme Dialog */}
      <SerialPhotoCapture
        open={showSerialDialog}
        onOpenChange={setShowSerialDialog}
        onFinish={handleSerialUpload}
        title="Fotos für Bericht"
      />
    </div>
  );
}
