import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildEmployeeDocumentPath,
  canBeVisibleToEmployee,
  groupDocumentsByFolder,
  personalCategoryLabel,
  sortFolders,
  suggestBezeichnung,
  UNFILED_LABEL,
  type EmployeeDocumentFolder,
  type PersonalDocumentCategory,
} from "@/lib/employeeDocuments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileViewer } from "@/components/FileViewer";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  Pencil,
  Lock,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

/** Zeile aus employee_documents. Eigenes Interface, weil die generierten
 *  Supabase-Types die neue Tabelle noch nicht kennen. */
interface PersonalDocument {
  id: string;
  employee_id: string;
  user_id: string | null;
  kategorie: string;
  bezeichnung: string;
  dokument_datum: string | null;
  notizen: string | null;
  file_path: string;
  sichtbar_fuer_mitarbeiter: boolean;
  folder_id: string | null;
  created_at: string;
}

interface Props {
  employeeId: string;
  userId?: string | null;
  kategorie: PersonalDocumentCategory;
  employeeName?: string;
}

const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|jpe?g|png|heic|heif|docx?)$/i;
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** Nur PDF und Bilder lassen sich im FileViewer darstellen. */
const isPreviewable = (path: string) => /\.(pdf|jpe?g|png|heic|heif)$/i.test(path);

/** Radix-Select vertraegt keinen leeren Wert - Platzhalter fuer "kein Ordner". */
const NO_FOLDER = "__none__";

const emptyForm = {
  bezeichnung: "",
  dokument_datum: "",
  notizen: "",
  sichtbar: true,
  folderId: NO_FOLDER,
};

export default function EmployeePersonalDocuments({
  employeeId,
  userId,
  kategorie,
  employeeName,
}: Props) {
  const [documents, setDocuments] = useState<PersonalDocument[]>([]);
  const [folders, setFolders] = useState<EmployeeDocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<PersonalDocument | null>(null);
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Ordner anlegen / umbenennen
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<EmployeeDocumentFolder | null>(null);

  const canBeVisible = canBeVisibleToEmployee(userId);
  const label = personalCategoryLabel(kategorie);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    // Cast noetig: generierte Supabase-Types kennen die neuen Tabellen noch nicht
    const [docsRes, foldersRes] = await Promise.all([
      (supabase as any).from("employee_documents")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("kategorie", kategorie)
        .order("dokument_datum", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      (supabase as any).from("employee_document_folders")
        .select("id, kategorie, name, sort_order")
        .eq("kategorie", kategorie),
    ]);

    if (docsRes.error) {
      toast({ title: "Fehler", description: docsRes.error.message, variant: "destructive" });
    } else {
      setDocuments((docsRes.data || []) as PersonalDocument[]);
    }
    if (foldersRes.error) {
      toast({ title: "Fehler", description: foldersRes.error.message, variant: "destructive" });
    } else {
      setFolders((foldersRes.data || []) as EmployeeDocumentFolder[]);
    }
    setLoading(false);
  }, [employeeId, kategorie]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -------------------------------------------------------------------------
  // Ordner
  // -------------------------------------------------------------------------

  const handleSaveFolder = async () => {
    const name = folderName.trim();
    if (!name) {
      toast({ title: "Name fehlt", variant: "destructive" });
      return;
    }

    if (renamingFolder) {
      const { error } = await (supabase as any).from("employee_document_folders")
        .update({ name })
        .eq("id", renamingFolder.id);
      if (error) {
        toast({
          title: "Fehler",
          description: error.message.includes("duplicate")
            ? "Ein Ordner mit diesem Namen existiert bereits."
            : error.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Ordner umbenannt" });
    } else {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const nextSort = folders.reduce((max, f) => Math.max(max, f.sort_order), -1) + 1;
      const { error } = await (supabase as any).from("employee_document_folders").insert({
        kategorie,
        name,
        sort_order: nextSort,
        created_by: currentUser?.id ?? null,
      });
      if (error) {
        toast({
          title: "Fehler",
          description: error.message.includes("duplicate")
            ? "Ein Ordner mit diesem Namen existiert bereits."
            : error.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Ordner angelegt" });
    }

    setFolderDialogOpen(false);
    setFolderName("");
    setRenamingFolder(null);
    fetchAll();
  };

  const handleDeleteFolder = async (folder: EmployeeDocumentFolder) => {
    const count = documents.filter((d) => d.folder_id === folder.id).length;
    const hint = count > 0
      ? `\n\nDie ${count} enthaltene(n) Dokument(e) bleiben erhalten und rutschen nach „${UNFILED_LABEL}".`
      : "";
    if (!confirm(`Ordner "${folder.name}" wirklich löschen?${hint}`)) return;

    const { error } = await (supabase as any).from("employee_document_folders")
      .delete()
      .eq("id", folder.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ordner gelöscht" });
    fetchAll();
  };

  const toggleFolder = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Dokumente
  // -------------------------------------------------------------------------

  const handleFileSelected = (file: File | null) => {
    if (!file) return;

    if (file.size > MAX_SIZE) {
      toast({
        title: "Datei zu groß",
        description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) — max. 50 MB`,
        variant: "destructive",
      });
      return;
    }

    const nameOk = ALLOWED_EXT.test(file.name);
    // Handy-Kamera liefert teils einen leeren MIME-Typ
    const typeOk = ALLOWED_TYPES.includes(file.type) || file.type === "";
    if (!nameOk || !typeOk) {
      toast({
        title: "Dateityp nicht erlaubt",
        description: "Nur PDF, Word (DOC/DOCX) und JPG/PNG.",
        variant: "destructive",
      });
      return;
    }

    setPendingFile(file);
    setForm({
      bezeichnung: suggestBezeichnung(file.name),
      dokument_datum: "",
      notizen: "",
      sichtbar: canBeVisible,
      folderId: NO_FOLDER,
    });
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    if (!form.bezeichnung.trim()) {
      toast({ title: "Bezeichnung fehlt", variant: "destructive" });
      return;
    }

    setUploading(true);
    const sichtbar = form.sichtbar && canBeVisible;
    const filePath = buildEmployeeDocumentPath({
      userId,
      employeeId,
      kategorie,
      sichtbar,
      fileName: pendingFile.name,
    });

    try {
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(filePath, pendingFile, { contentType: pendingFile.type || undefined });
      if (uploadError) throw uploadError;

      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const { error: insertError } = await (supabase as any).from("employee_documents").insert({
        employee_id: employeeId,
        user_id: userId || null,
        kategorie,
        bezeichnung: form.bezeichnung.trim(),
        dokument_datum: form.dokument_datum || null,
        notizen: form.notizen.trim() || null,
        file_path: filePath,
        sichtbar_fuer_mitarbeiter: sichtbar,
        folder_id: form.folderId === NO_FOLDER ? null : form.folderId,
        uploaded_by: currentUser?.id ?? null,
      });

      // Datei ohne DB-Zeile waere unsichtbar und nicht loeschbar -> aufraeumen
      if (insertError) {
        await supabase.storage.from("employee-documents").remove([filePath]);
        throw insertError;
      }

      // Mitarbeiter nur benachrichtigen, wenn er das Dokument auch sehen kann
      if (sichtbar && userId) {
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "personalunterlage_upload",
          title: "Neue Unterlage verfügbar",
          message: `${label}: ${form.bezeichnung.trim()}`,
          metadata: { kategorie, bezeichnung: form.bezeichnung.trim() },
        });
        // Push ist Beiwerk - ein Fehler darf den Upload nicht scheitern lassen
        supabase.functions
          .invoke("send-push", {
            body: {
              user_ids: [userId],
              title: "Neue Unterlage verfügbar",
              body: `${label}: ${form.bezeichnung.trim()}`,
              url: "/my-documents",
            },
          })
          .catch(() => undefined);
      }

      toast({ title: "Erfolg", description: "Dokument hochgeladen" });
      setPendingFile(null);
      setForm({ ...emptyForm });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editing.bezeichnung.trim()) {
      toast({ title: "Bezeichnung fehlt", variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).from("employee_documents")
      .update({
        bezeichnung: editing.bezeichnung.trim(),
        dokument_datum: editing.dokument_datum || null,
        notizen: editing.notizen?.trim() || null,
        folder_id: editing.folder_id,
      })
      .eq("id", editing.id);

    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    setEditing(null);
    fetchAll();
  };

  const handleDownload = async (doc: PersonalDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .download(doc.file_path);
      if (error) throw error;

      const fileName = doc.file_path.split("/").pop() || doc.bezeichnung;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (doc: PersonalDocument) => {
    if (!confirm(`"${doc.bezeichnung}" wirklich löschen?`)) return;

    const { error: storageError } = await supabase.storage
      .from("employee-documents")
      .remove([doc.file_path]);
    if (storageError) {
      toast({ title: "Fehler", description: storageError.message, variant: "destructive" });
      return;
    }

    const { error } = await (supabase as any).from("employee_documents")
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Erfolg", description: "Dokument gelöscht" });
    fetchAll();
  };

  // Leere Ordner mit anzeigen, damit ein frisch angelegter Ordner sichtbar ist
  const groups = groupDocumentsByFolder(documents, folders, true);

  const renderDocument = (doc: PersonalDocument) => (
    <div
      key={doc.id}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg bg-card"
    >
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{doc.bezeichnung}</p>
            {!doc.sichtbar_fuer_mitarbeiter && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Lock className="w-3 h-3" />
                nur intern
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {doc.dokument_datum
              ? new Date(doc.dokument_datum).toLocaleDateString("de-DE")
              : new Date(doc.created_at).toLocaleDateString("de-DE")}
            {doc.notizen ? ` · ${doc.notizen}` : ""}
          </p>
          <p className="text-xs text-muted-foreground/70 truncate">
            {doc.file_path.split("/").pop()}
          </p>
        </div>
      </div>
      <div className="flex gap-2 self-end sm:self-auto">
        {isPreviewable(doc.file_path) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewingFile({ name: doc.bezeichnung, path: doc.file_path })}
            className="h-9 min-w-[44px]"
            title="Ansehen"
          >
            <Eye className="w-4 h-4" />
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleDownload(doc)}
          className="h-9 min-w-[44px]"
          title="Herunterladen"
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing({ ...doc })}
          className="h-9 min-w-[44px]"
          title="Bearbeiten"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => handleDelete(doc)}
          className="h-9 min-w-[44px]"
          title="Löschen"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>{label}</CardTitle>
            <CardDescription>
              {loading ? "Lädt..." : `${documents.length} Dokument(e)`}
              {employeeName ? ` · ${employeeName}` : ""}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRenamingFolder(null);
              setFolderName("");
              setFolderDialogOpen(true);
            }}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Neuer Ordner
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`upload-${kategorie}`} className="text-sm sm:text-base">
            Neue Datei hochladen
          </Label>
          <Input
            id={`upload-${kategorie}`}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx"
            onChange={(e) => {
              handleFileSelected(e.target.files?.[0] || null);
              e.target.value = "";
            }}
            disabled={uploading}
            className="h-11 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold hover:file:bg-accent"
          />
          <p className="text-xs text-muted-foreground">
            PDF, Word oder Bild · max. 50 MB
          </p>
        </div>

        {!loading && documents.length === 0 && folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Dokumente vorhanden</p>
        ) : (
          <div className="space-y-3">
            {groups.map(({ folder, documents: docs }) => {
              const key = folder?.id ?? NO_FOLDER;
              const isOpen = !collapsed.has(key);
              return (
                <div key={key} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
                    <button
                      type="button"
                      onClick={() => toggleFolder(key)}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      {folder ? (
                        isOpen ? (
                          <FolderOpen className="w-4 h-4 flex-shrink-0 text-primary" />
                        ) : (
                          <Folder className="w-4 h-4 flex-shrink-0 text-primary" />
                        )
                      ) : (
                        <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {folder ? folder.name : UNFILED_LABEL}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({docs.length})
                      </span>
                    </button>
                    {folder && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Ordner umbenennen"
                          onClick={() => {
                            setRenamingFolder(folder);
                            setFolderName(folder.name);
                            setFolderDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="Ordner löschen"
                          onClick={() => handleDeleteFolder(folder)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <div className="p-2 space-y-2">
                      {docs.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-1 py-2">
                          Ordner ist leer — beim Hochladen oder über „Bearbeiten" zuordnen.
                        </p>
                      ) : (
                        docs.map(renderDocument)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Ordner anlegen / umbenennen */}
      <Dialog
        open={folderDialogOpen}
        onOpenChange={(open) => {
          setFolderDialogOpen(open);
          if (!open) {
            setFolderName("");
            setRenamingFolder(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {renamingFolder ? "Ordner umbenennen" : "Neuer Ordner"}
            </DialogTitle>
            <DialogDescription>
              Ordner gelten für alle Mitarbeiter — so bleibt die Ablage einheitlich.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name *</Label>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="z. B. Lehrabschluss"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveFolder();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveFolder}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Angaben zum neuen Dokument */}
      <Dialog
        open={!!pendingFile}
        onOpenChange={(open) => {
          if (!open && !uploading) {
            setPendingFile(null);
            setForm({ ...emptyForm });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{label} hinzufügen</DialogTitle>
            <DialogDescription className="truncate">{pendingFile?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-bezeichnung">Bezeichnung *</Label>
              <Input
                id="doc-bezeichnung"
                value={form.bezeichnung}
                onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })}
                placeholder="z. B. Dienstvertrag Vollzeit"
              />
            </div>
            <div className="space-y-2">
              <Label>Ordner</Label>
              <Select
                value={form.folderId}
                onValueChange={(v) => setForm({ ...form, folderId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FOLDER}>{UNFILED_LABEL}</SelectItem>
                  {sortFolders(folders).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-datum">Dokumentdatum</Label>
              <Input
                id="doc-datum"
                type="date"
                value={form.dokument_datum}
                onChange={(e) => setForm({ ...form, dokument_datum: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-notiz">Notiz</Label>
              <Textarea
                id="doc-notiz"
                value={form.notizen}
                onChange={(e) => setForm({ ...form, notizen: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="doc-sichtbar"
                checked={form.sichtbar && canBeVisible}
                disabled={!canBeVisible}
                onCheckedChange={(v) => setForm({ ...form, sichtbar: v === true })}
              />
              <div className="grid gap-1 leading-none">
                <Label htmlFor="doc-sichtbar" className="cursor-pointer">
                  Für Mitarbeiter sichtbar
                </Label>
                <p className="text-xs text-muted-foreground">
                  {canBeVisible
                    ? "Abwählen: Dokument bleibt nur für Administratoren sichtbar."
                    : "Mitarbeiter hat noch keinen App-Zugang — Dokument bleibt intern."}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingFile(null);
                setForm({ ...emptyForm });
              }}
              disabled={uploading}
            >
              Abbrechen
            </Button>
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Lädt hoch..." : "Hochladen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Angaben nachträglich ändern */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Angaben bearbeiten</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-bezeichnung">Bezeichnung *</Label>
                <Input
                  id="edit-bezeichnung"
                  value={editing.bezeichnung}
                  onChange={(e) => setEditing({ ...editing, bezeichnung: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Ordner</Label>
                <Select
                  value={editing.folder_id ?? NO_FOLDER}
                  onValueChange={(v) =>
                    setEditing({ ...editing, folder_id: v === NO_FOLDER ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FOLDER}>{UNFILED_LABEL}</SelectItem>
                    {sortFolders(folders).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-datum">Dokumentdatum</Label>
                <Input
                  id="edit-datum"
                  type="date"
                  value={editing.dokument_datum || ""}
                  onChange={(e) => setEditing({ ...editing, dokument_datum: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notiz">Notiz</Label>
                <Textarea
                  id="edit-notiz"
                  value={editing.notizen || ""}
                  onChange={(e) => setEditing({ ...editing, notizen: e.target.value })}
                  rows={2}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Die Sichtbarkeit lässt sich nachträglich nicht ändern, weil die Datei
                dafür verschoben werden müsste. Bei Bedarf löschen und neu hochladen.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveEdit}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingFile && (
        <FileViewer
          open={true}
          onClose={() => setViewingFile(null)}
          fileName={viewingFile.name}
          filePath={viewingFile.path}
          bucketName="employee-documents"
        />
      )}
    </Card>
  );
}
