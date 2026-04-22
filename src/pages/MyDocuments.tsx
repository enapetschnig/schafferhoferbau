import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Camera, Upload, Download, Eye, Trash2, Archive } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { FileViewer } from "@/components/FileViewer";

interface Document {
  name: string;
  path: string;
  created_at?: string;
}

export default function MyDocuments() {
  const [payslips, setPayslips] = useState<Document[]>([]);
  const [sickNotes, setSickNotes] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string; bucketName: string } | null>(null);
  const [selectedPayslips, setSelectedPayslips] = useState<Set<string>>(new Set());
  const [selectedSickNotes, setSelectedSickNotes] = useState<Set<string>>(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    fetchUserAndDocuments();
  }, []);

  const fetchUserAndDocuments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      return;
    }

    setUserId(user.id);
  await Promise.all([
      fetchDocuments(user.id, "lohnzettel", setPayslips),
      fetchDocuments(user.id, "krankmeldung", setSickNotes),
    ]);
    setLoading(false);
  };

  const fetchDocuments = async (
    userId: string,
    type: "lohnzettel" | "krankmeldung",
    setter: (docs: Document[]) => void
  ) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .list(`${userId}/${type}`);

    if (error) {
      console.error(`Fehler beim Laden von ${type}:`, error);
      return;
    }

    if (!data) {
      setter([]);
      return;
    }

    let docs = data.map((file) => ({
      name: file.name,
      path: `${userId}/${type}/${file.name}`,
      created_at: file.created_at,
    }));

    // Lohnzettel: nach Freigabedatum filtern (MA sieht nur freigegebene)
    if (type === "lohnzettel" && docs.length > 0) {
      const paths = docs.map((d) => d.path);
      const { data: meta } = await supabase
        .from("payslip_metadata")
        .select("file_path, release_date")
        .in("file_path", paths);

      const today = new Date().toISOString().split("T")[0];
      const releaseByPath = new Map<string, string>(
        (meta || []).map((m: any) => [m.file_path, m.release_date])
      );

      docs = docs.filter((d) => {
        const release = releaseByPath.get(d.path);
        // Kein Metadaten-Eintrag → alter Lohnzettel vor Feature-Einführung → immer sichtbar
        if (!release) return true;
        return release <= today;
      });
    }

    setter(docs);
  };

  const handleUpload = async (type: "lohnzettel" | "krankmeldung", file: File | null) => {
    if (!file || !userId) return;

    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Fehler", description: "Datei ist zu groß (max. 50 MB)" });
      return;
    }

    // Strikte Dateityp-Whitelist - verhindert Upload von .exe/.html/.svg etc.
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/heic",
      "image/heif",
    ];
    const allowedExtensions = /\.(pdf|jpe?g|png|heic|heif)$/i;
    const nameOk = allowedExtensions.test(file.name);
    const typeOk = allowedTypes.includes(file.type) || file.type === ""; // Handy-Camera liefert teils ""
    if (!nameOk || !typeOk) {
      toast({
        variant: "destructive",
        title: "Dateityp nicht erlaubt",
        description: "Nur PDF und JPG/PNG sind zulässig.",
      });
      return;
    }

    setUploading(true);

    const filePath = `${userId}/${type}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from("employee-documents")
      .upload(filePath, file);

    if (error) {
      console.error("Upload-Fehler:", error);
      toast({ variant: "destructive", title: "Fehler", description: `Upload fehlgeschlagen: ${error.message}` });
    } else {
      toast({ title: "Erfolg", description: "Dokument hochgeladen" });
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes);

      // Notify admins when employee uploads a sick note
      if (type === "krankmeldung") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("vorname, nachname")
          .eq("id", userId)
          .single();
        const uploaderName = profile
          ? `${profile.vorname} ${profile.nachname}`.trim() || "Mitarbeiter"
          : "Mitarbeiter";
        await supabase.rpc("notify_admins_sick_note", {
          p_uploader_id: userId,
          p_uploader_name: uploaderName,
          p_file_name: file.name,
        });
      }
    }

    setUploading(false);
  };

  const handleView = (doc: Document, type: "lohnzettel" | "krankmeldung") => {
    setViewingFile({
      name: doc.name,
      path: doc.path,
      bucketName: "employee-documents"
    });
  };

  const toggleSelection = (type: "lohnzettel" | "krankmeldung", path: string) => {
    const setter = type === "lohnzettel" ? setSelectedPayslips : setSelectedSickNotes;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll = (type: "lohnzettel" | "krankmeldung") => {
    const docs = type === "lohnzettel" ? payslips : sickNotes;
    const selected = type === "lohnzettel" ? selectedPayslips : selectedSickNotes;
    const setter = type === "lohnzettel" ? setSelectedPayslips : setSelectedSickNotes;
    if (selected.size === docs.length) setter(new Set());
    else setter(new Set(docs.map((d) => d.path)));
  };

  const handleBulkDownload = async (type: "lohnzettel" | "krankmeldung") => {
    const docs = type === "lohnzettel" ? payslips : sickNotes;
    const selected = type === "lohnzettel" ? selectedPayslips : selectedSickNotes;
    const setter = type === "lohnzettel" ? setSelectedPayslips : setSelectedSickNotes;
    const chosen = docs.filter((d) => selected.has(d.path));
    if (chosen.length === 0) return;

    // Ein Dokument: direkter Download ohne ZIP
    if (chosen.length === 1) {
      const { data } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(chosen[0].path, 3600);
      if (data?.signedUrl) {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = chosen[0].name;
        a.click();
      }
      setter(new Set());
      return;
    }

    setDownloadingZip(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const doc of chosen) {
        const { data } = await supabase.storage
          .from("employee-documents")
          .createSignedUrl(doc.path, 3600);
        if (!data?.signedUrl) continue;
        const resp = await fetch(data.signedUrl);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        zip.file(doc.name, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const label = type === "lohnzettel" ? "Lohnzettel" : "Krankmeldungen";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${label}_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: `${chosen.length} Dateien als ZIP heruntergeladen` });
      setter(new Set());
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err?.message });
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleDelete = async (doc: Document, type: "lohnzettel" | "krankmeldung") => {
    if (!confirm(`Möchten Sie "${doc.name}" wirklich löschen?`)) return;

    const { error } = await supabase.storage
      .from("employee-documents")
      .remove([doc.path]);

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Löschen fehlgeschlagen" });
    } else {
      toast({ title: "Erfolg", description: "Dokument gelöscht" });
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes);
    }
  };

  if (loading) {
    return <div className="p-4">Lädt...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Meine Dokumente" />

      <div className="container mx-auto p-4 max-w-4xl">
        <Tabs defaultValue="payslips" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payslips">
              <FileText className="w-4 h-4 mr-2" />
              Meine Lohnzettel
            </TabsTrigger>
            <TabsTrigger value="sicknotes">
              <FileText className="w-4 h-4 mr-2" />
              Krankmeldungen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payslips" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Meine Lohnzettel</CardTitle>
                <CardDescription>
                  Vom Administrator hochgeladene Lohnzettel
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payslips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Lohnzettel vorhanden</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => selectAll("lohnzettel")}
                      >
                        {selectedPayslips.size === payslips.length ? "Auswahl leeren" : "Alle auswaehlen"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={selectedPayslips.size === 0 || downloadingZip}
                        onClick={() => handleBulkDownload("lohnzettel")}
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        {selectedPayslips.size > 1
                          ? `${selectedPayslips.size} als ZIP laden`
                          : selectedPayslips.size === 1
                          ? "1 Datei laden"
                          : "Auswahl laden"}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {payslips.map((doc) => (
                        <div
                          key={doc.path}
                          className={`flex items-center justify-between p-3 border rounded-md transition-colors ${
                            selectedPayslips.has(doc.path) ? "bg-primary/5 border-primary/30" : "hover:bg-accent"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedPayslips.has(doc.path)}
                              onCheckedChange={() => toggleSelection("lohnzettel", doc.path)}
                            />
                            <FileText className="w-5 h-5 text-primary shrink-0" />
                            <span className="text-sm truncate">{doc.name}</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleView(doc, "lohnzettel")}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sicknotes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Krankmeldungen hochladen</CardTitle>
                <CardDescription>
                  Krankmeldungen für den Administrator hochladen
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Label>Krankmeldung hochladen</Label>
                  <div className="flex flex-col gap-2">
                    {/* Camera capture (mobile) */}
                    <label htmlFor="sicknote-camera" className={`flex items-center justify-center gap-2 h-11 px-4 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors text-sm font-medium ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                      <Camera className="w-5 h-5 text-primary" />
                      Foto aufnehmen
                      <input
                        id="sicknote-camera"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => handleUpload("krankmeldung", e.target.files?.[0] || null)}
                        disabled={uploading}
                      />
                    </label>
                    {/* File picker */}
                    <Input
                      id="sicknote-upload"
                      type="file"
                      onChange={(e) => handleUpload("krankmeldung", e.target.files?.[0] || null)}
                      disabled={uploading}
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                  </div>
                  {uploading && <p className="text-sm text-muted-foreground">Lädt hoch...</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Meine Krankmeldungen</CardTitle>
                <CardDescription>
                  Hochgeladene Krankmeldungen
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sickNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Krankmeldungen vorhanden</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => selectAll("krankmeldung")}
                      >
                        {selectedSickNotes.size === sickNotes.length ? "Auswahl leeren" : "Alle auswaehlen"}
                      </Button>
                      <Button
                        size="sm"
                        disabled={selectedSickNotes.size === 0 || downloadingZip}
                        onClick={() => handleBulkDownload("krankmeldung")}
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        {selectedSickNotes.size > 1
                          ? `${selectedSickNotes.size} als ZIP laden`
                          : selectedSickNotes.size === 1
                          ? "1 Datei laden"
                          : "Auswahl laden"}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {sickNotes.map((doc) => (
                        <div
                          key={doc.path}
                          className={`flex items-center justify-between p-3 border rounded-md transition-colors ${
                            selectedSickNotes.has(doc.path) ? "bg-primary/5 border-primary/30" : "hover:bg-accent"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedSickNotes.has(doc.path)}
                              onCheckedChange={() => toggleSelection("krankmeldung", doc.path)}
                            />
                            <FileText className="w-5 h-5 text-primary shrink-0" />
                            <span className="text-sm truncate">{doc.name}</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleView(doc, "krankmeldung")}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(doc, "krankmeldung")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {viewingFile && (
        <FileViewer
          open={true}
          onClose={() => setViewingFile(null)}
          fileName={viewingFile.name}
          filePath={viewingFile.path}
          bucketName={viewingFile.bucketName}
        />
      )}
    </div>
  );
}
