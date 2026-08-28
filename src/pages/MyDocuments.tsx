import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFileName } from "@/lib/storageFileName";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Camera, Upload, Download, Eye, Trash2, Archive, Users, FolderOpen } from "lucide-react";
import {
  PERSONAL_DOCUMENT_CATEGORIES,
  personalCategoryLabel,
  groupDocumentsByFolder,
  UNFILED_LABEL,
  type EmployeeDocumentFolder,
} from "@/lib/employeeDocuments";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { FileViewer } from "@/components/FileViewer";

interface Document {
  name: string;
  path: string;
  created_at?: string;
}

type EmployeeOption = { user_id: string; name: string };

/** Personalunterlage aus employee_documents. RLS liefert dem Mitarbeiter
 *  ausschliesslich seine eigenen, freigegebenen Zeilen. */
interface PersonalDocument {
  id: string;
  kategorie: string;
  bezeichnung: string;
  dokument_datum: string | null;
  notizen: string | null;
  file_path: string;
  folder_id: string | null;
  created_at: string;
}

export default function MyDocuments() {
  const [payslips, setPayslips] = useState<Document[]>([]);
  const [sickNotes, setSickNotes] = useState<Document[]>([]);
  const [personalDocs, setPersonalDocs] = useState<PersonalDocument[]>([]);
  const [personalFolders, setPersonalFolders] = useState<EmployeeDocumentFolder[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string; bucketName: string } | null>(null);
  const [selectedPayslips, setSelectedPayslips] = useState<Set<string>>(new Set());
  const [selectedSickNotes, setSelectedSickNotes] = useState<Set<string>>(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);
  // Admin-Ansicht: Lohnzettel aller Mitarbeiter einsehbar, getrennt nach MA.
  const [isAdmin, setIsAdmin] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  // Wessen Lohnzettel gerade angezeigt werden (Admin kann wechseln).
  const [viewUserId, setViewUserId] = useState<string>("");

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
    setViewUserId(user.id);

    // Admin-Check + Mitarbeiter-Liste (fuer den Lohnzettel-Wechsler)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const admin = roleData?.role === "administrator";
    setIsAdmin(admin);
    if (admin) {
      // Sortierung folgt der Admin-Reihenfolge (profiles.sort_order).
      const { data: profs } = await (supabase.from("profiles") as any)
        .select("id, vorname, nachname, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("nachname");
      setEmployeeOptions(
        (profs || []).map((p: any) => ({
          user_id: p.id,
          name: `${p.vorname} ${p.nachname}`.trim(),
        }))
      );
    }

    await Promise.all([
      fetchDocuments(user.id, "lohnzettel", setPayslips, admin),
      fetchDocuments(user.id, "krankmeldung", setSickNotes, admin),
      fetchPersonalDocuments(user.id),
    ]);
    setLoading(false);
  };

  // Personalunterlagen (Anmeldungen, Dienstvertraege, Zeugnisse, Sonstiges).
  // Filter auf user_id ist noetig, weil ein Admin sonst alle Zeilen saehe.
  const fetchPersonalDocuments = async (targetUserId: string) => {
    // Cast noetig: generierte Supabase-Types kennen die neuen Tabellen noch nicht
    const [docsRes, foldersRes] = await Promise.all([
      (supabase as any).from("employee_documents")
        .select(
          "id, kategorie, bezeichnung, dokument_datum, notizen, file_path, folder_id, created_at"
        )
        .eq("user_id", targetUserId)
        .eq("sichtbar_fuer_mitarbeiter", true)
        .order("dokument_datum", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      (supabase as any).from("employee_document_folders").select(
        "id, kategorie, name, sort_order"
      ),
    ]);

    if (docsRes.error) {
      console.error("Fehler beim Laden der Personalunterlagen:", docsRes.error);
      return;
    }
    setPersonalDocs((docsRes.data || []) as PersonalDocument[]);
    if (!foldersRes.error) {
      setPersonalFolders((foldersRes.data || []) as EmployeeDocumentFolder[]);
    }
  };

  const handlePersonalDownload = async (doc: PersonalDocument) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .download(doc.file_path);

    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: "Download fehlgeschlagen" });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_path.split("/").pop() || doc.bezeichnung;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchDocuments = async (
    targetUserId: string,
    type: "lohnzettel" | "krankmeldung",
    setter: (docs: Document[]) => void,
    adminView: boolean
  ) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .list(`${targetUserId}/${type}`);

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
      path: `${targetUserId}/${type}/${file.name}`,
      created_at: file.created_at,
    }));

    // Lohnzettel: nach Freigabedatum filtern (MA sieht nur freigegebene).
    // Admin sieht ALLE — auch noch nicht freigegebene (Kontroll-Zweck).
    if (type === "lohnzettel" && docs.length > 0 && !adminView) {
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

  // Admin wechselt den Mitarbeiter → dessen Lohnzettel laden.
  const handleViewUserChange = async (newUserId: string) => {
    setViewUserId(newUserId);
    setSelectedPayslips(new Set());
    await fetchDocuments(newUserId, "lohnzettel", setPayslips, true);
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

    const filePath = `${userId}/${type}/${Date.now()}_${sanitizeStorageFileName(file.name)}`;
    const { error } = await supabase.storage
      .from("employee-documents")
      .upload(filePath, file);

    if (error) {
      console.error("Upload-Fehler:", error);
      toast({ variant: "destructive", title: "Fehler", description: `Upload fehlgeschlagen: ${error.message}` });
    } else {
      toast({ title: "Erfolg", description: "Dokument hochgeladen" });
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes, isAdmin);

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

  /** Einzelne Datei herunterladen (ohne Umweg ueber die Auswahl). */
  const handleSingleDownload = async (doc: Document) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .download(doc.path);

    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: "Download fehlgeschlagen" });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Lohnzettel loeschen - nur fuer Administratoren. Entfernt die Datei UND den
   * zugehoerigen payslip_metadata-Eintrag; sonst bliebe ein verwaister Datensatz
   * mit dem (eindeutigen) file_path zurueck und blockierte einen Neu-Upload
   * unter demselben Pfad.
   */
  const handleDeletePayslips = async (docs: Document[]) => {
    if (!isAdmin || docs.length === 0) return;

    const frage =
      docs.length === 1
        ? `Lohnzettel "${docs[0].name}" wirklich löschen?`
        : `${docs.length} Lohnzettel wirklich löschen?`;
    if (!confirm(`${frage}\n\nDas lässt sich nicht rückgängig machen.`)) return;

    const paths = docs.map((d) => d.path);
    const { error } = await supabase.storage.from("employee-documents").remove(paths);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Löschen fehlgeschlagen" });
      return;
    }

    await supabase.from("payslip_metadata").delete().in("file_path", paths);

    toast({
      title: "Erfolg",
      description: docs.length === 1 ? "Lohnzettel gelöscht" : `${docs.length} Lohnzettel gelöscht`,
    });
    setSelectedPayslips(new Set());
    // Ansicht des gerade gewaehlten Mitarbeiters neu laden, nicht die eigene
    await fetchDocuments(viewUserId || userId, "lohnzettel", setPayslips, isAdmin);
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
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes, isAdmin);
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="payslips">
              <FileText className="w-4 h-4 mr-2" />
              Meine Lohnzettel
            </TabsTrigger>
            <TabsTrigger value="sicknotes">
              <FileText className="w-4 h-4 mr-2" />
              Krankmeldungen
            </TabsTrigger>
            <TabsTrigger value="personal">
              <FolderOpen className="w-4 h-4 mr-2" />
              Meine Unterlagen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payslips" className="space-y-4">
            {/* Admin: Lohnzettel aller Mitarbeiter einsehbar — getrennt nach MA */}
            {isAdmin && employeeOptions.length > 0 && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Label className="flex items-center gap-1.5 shrink-0">
                      <Users className="w-4 h-4" />
                      Lohnzettel von:
                    </Label>
                    <Select value={viewUserId} onValueChange={handleViewUserChange}>
                      <SelectTrigger className="w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {employeeOptions.map((emp) => (
                          <SelectItem key={emp.user_id} value={emp.user_id}>
                            {emp.name}{emp.user_id === userId ? " (ich)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Als Administrator siehst du auch noch nicht freigegebene Lohnzettel.
                  </p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>
                  {isAdmin && viewUserId !== userId
                    ? `Lohnzettel — ${employeeOptions.find((e) => e.user_id === viewUserId)?.name || "Mitarbeiter"}`
                    : "Meine Lohnzettel"}
                </CardTitle>
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
                        {selectedPayslips.size === payslips.length ? "Auswahl leeren" : "Alle auswählen"}
                      </Button>
                      <div className="flex gap-2 flex-wrap">
                        {/* Loeschen nur fuer Administratoren */}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={selectedPayslips.size === 0}
                            onClick={() =>
                              handleDeletePayslips(
                                payslips.filter((d) => selectedPayslips.has(d.path))
                              )
                            }
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            {selectedPayslips.size > 1
                              ? `${selectedPayslips.size} löschen`
                              : "Löschen"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={selectedPayslips.size === 0 || downloadingZip}
                          onClick={() => handleBulkDownload("lohnzettel")}
                        >
                          <Archive className="w-4 h-4 mr-1" />
                          {selectedPayslips.size > 1
                            ? `${selectedPayslips.size} als ZIP herunterladen`
                            : selectedPayslips.size === 1
                            ? "1 Datei herunterladen"
                            : "Auswahl herunterladen"}
                        </Button>
                      </div>
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
                              title="Ansehen"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSingleDownload(doc)}
                              title="Herunterladen"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeletePayslips([doc])}
                                title="Löschen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
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
                        {selectedSickNotes.size === sickNotes.length ? "Auswahl leeren" : "Alle auswählen"}
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

          <TabsContent value="personal" className="space-y-4">
            {personalDocs.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Meine Unterlagen</CardTitle>
                  <CardDescription>
                    Vom Administrator hinterlegte Unterlagen wie Anmeldungen,
                    Dienstverträge oder Zeugnisse
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Keine Unterlagen vorhanden
                  </p>
                </CardContent>
              </Card>
            ) : (
              PERSONAL_DOCUMENT_CATEGORIES.map((cat) => {
                const docs = personalDocs.filter((d) => d.kategorie === cat.id);
                if (docs.length === 0) return null;
                return (
                  <Card key={cat.id}>
                    <CardHeader>
                      <CardTitle>{personalCategoryLabel(cat.id)}</CardTitle>
                      <CardDescription>{docs.length} Dokument(e)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {groupDocumentsByFolder(
                        docs,
                        personalFolders.filter((f) => f.kategorie === cat.id)
                      ).map(({ folder, documents: folderDocs }) => (
                      <div key={folder?.id ?? "unfiled"} className="space-y-2">
                        {/* Ordnerzeile nur zeigen, wenn es ueberhaupt Ordner gibt */}
                        {folder && (
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <FolderOpen className="w-3.5 h-3.5" />
                            {folder.name}
                          </p>
                        )}
                        {!folder && personalFolders.some((f) => f.kategorie === cat.id) && (
                          <p className="text-xs font-medium text-muted-foreground">
                            {UNFILED_LABEL}
                          </p>
                        )}
                        {folderDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-3 p-3 border rounded-md hover:bg-accent"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <FileText className="w-5 h-5 text-primary shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  {doc.bezeichnung}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {doc.dokument_datum
                                    ? new Date(doc.dokument_datum).toLocaleDateString("de-DE")
                                    : new Date(doc.created_at).toLocaleDateString("de-DE")}
                                  {doc.notizen ? ` · ${doc.notizen}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {/\.(pdf|jpe?g|png|heic|heif)$/i.test(doc.file_path) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setViewingFile({
                                      name: doc.bezeichnung,
                                      path: doc.file_path,
                                      bucketName: "employee-documents",
                                    })
                                  }
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePersonalDownload(doc)}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}
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
