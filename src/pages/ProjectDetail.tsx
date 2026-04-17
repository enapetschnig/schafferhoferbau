import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Upload, FileText, Trash2, Eye, Download, Archive, CheckSquare, Square, ChevronLeft, ChevronRight, X, Pencil } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageEditor } from "@/components/ImageEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { FileViewer } from "@/components/FileViewer";
import { Nachkalkulation } from "@/components/Nachkalkulation";

type DocumentType = "plans" | "reports" | "photos" | "chef" | "polier";

type StorageFile = {
  name: string;
  id: string;
  created_at: string;
  metadata: any;
};

type DocRecord = {
  id: string;
  name: string;
  file_url: string;
  sub_type: string | null;
  archived: boolean;
  created_at: string;
};

const bucketMap: Record<DocumentType, string> = {
  plans: "project-plans",
  reports: "project-reports",
  photos: "project-photos",
  chef: "project-chef",
  polier: "project-polier",
};

const titleMap: Record<DocumentType, string> = {
  plans: "Plaene / Auftraege",
  reports: "Regieberichte",
  photos: "Fotos",
  chef: "Chefordner",
  polier: "Polierordner",
};

// Tab-Konfiguration pro Typ
const tabConfig: Record<DocumentType, { key: string; label: string; subType?: string }[]> = {
  plans: [
    { key: "plaene", label: "Aktuelle Plaene", subType: "plan" },
    { key: "protokolle", label: "Besprechungsprotokolle", subType: "besprechungsprotokoll" },
    { key: "auftraege", label: "Auftraege", subType: "auftrag" },
    { key: "archiv", label: "Archiv" },
  ],
  photos: [
    { key: "aktuell", label: "Aktuelle Fotos" },
    { key: "archiv", label: "Archiv" },
  ],
  reports: [
    { key: "aktuell", label: "Alle Berichte" },
    { key: "archiv", label: "Archiv" },
  ],
  chef: [
    { key: "aktuell", label: "Alle Dateien" },
    { key: "archiv", label: "Archiv" },
  ],
  polier: [
    { key: "aktuell", label: "Alle Dateien" },
    { key: "archiv", label: "Archiv" },
  ],
};

const ProjectDetail = () => {
  const { projectId, type } = useParams<{ projectId: string; type: DocumentType }>();
  const { toast } = useToast();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [docRecords, setDocRecords] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("aktuell");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [dateFilter, setDateFilter] = useState("");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewerState, setViewerState] = useState<{
    open: boolean;
    fileName: string;
    filePath: string;
  }>({ open: false, fileName: "", filePath: "" });

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [urlsLoading, setUrlsLoading] = useState(false);

  const tabs = type ? tabConfig[type] : [];

  useEffect(() => {
    if (projectId && type) {
      setActiveTab(tabs[0]?.key || "aktuell");
      checkAdminStatus();
      fetchProjectName();
      fetchFiles();
      fetchDocRecords();
    }
  }, [projectId, type]);

  useEffect(() => {
    if (files.length > 0 && projectId && type) {
      generateSignedUrls();
    }
  }, [files]);

  const generateSignedUrls = async () => {
    if (!projectId || !type) return;
    const bucket = bucketMap[type];
    const isPublic = bucket === "project-photos";
    setUrlsLoading(true);
    const urls: Record<string, string> = {};
    for (const file of files) {
      const filePath = `${projectId}/${file.name}`;
      if (isPublic) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        urls[file.name] = data.publicUrl;
      } else {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
        if (!error && data) urls[file.name] = data.signedUrl;
      }
    }
    setSignedUrls(urls);
    setUrlsLoading(false);
  };

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    setIsAdmin(data?.role === "administrator");
  };

  const fetchProjectName = async () => {
    if (!projectId) return;
    const { data } = await supabase.from("projects").select("name").eq("id", projectId).single();
    if (data) setProjectName(data.name);
  };

  const fetchFiles = async () => {
    if (!projectId || !type) return;
    const bucket = bucketMap[type];
    const { data, error } = await supabase.storage.from(bucket).list(projectId, {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (!error && data) setFiles(data);
    setLoading(false);
  };

  const fetchDocRecords = async () => {
    if (!projectId || !type) return;
    const { data } = await supabase
      .from("documents")
      .select("id, name, file_url, sub_type, archived, created_at")
      .eq("project_id", projectId)
      .eq("typ", type)
      .order("created_at", { ascending: false });
    if (data) setDocRecords(data as DocRecord[]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, subType?: string) => {
    if (!e.target.files || e.target.files.length === 0 || !projectId || !type) return;
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();

    for (const file of Array.from(e.target.files)) {
      const bucket = bucketMap[type];
      const filePath = `${projectId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from(bucket).upload(filePath, file);

      if (!error && user) {
        // Dokument-Record in DB speichern
        await supabase.from("documents").insert({
          name: file.name,
          project_id: projectId,
          typ: type,
          sub_type: subType || null,
          file_url: filePath,
          user_id: user.id,
          archived: false,
        });
      }
    }

    toast({ title: "Hochgeladen", description: `${e.target.files.length} Datei(en) hochgeladen` });
    fetchFiles();
    fetchDocRecords();
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (file: StorageFile) => {
    if (!projectId || !type || !isAdmin) return;
    const bucket = bucketMap[type];
    const filePath = `${projectId}/${file.name}`;
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (!error) {
      // Auch DB-Record loeschen
      await supabase.from("documents").delete().eq("file_url", filePath);
      toast({ title: "Gelöscht" });
      fetchFiles();
      fetchDocRecords();
    }
  };

  // Bearbeitetes Bild als neue Datei im Bucket speichern
  const handleEditedImageSave = async (blob: Blob) => {
    if (!projectId || !type) {
      toast({ variant: "destructive", title: "Fehler", description: "Projekt-ID fehlt" });
      throw new Error("project id missing");
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Nicht angemeldet" });
      throw new Error("not authenticated");
    }

    const bucket = bucketMap[type];
    const fileName = `edited_${Date.now()}.jpg`;
    const filePath = `${projectId}/${fileName}`;

    const { error } = await supabase.storage.from(bucket).upload(filePath, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
    });

    if (error) {
      toast({ variant: "destructive", title: "Upload fehlgeschlagen", description: error.message });
      throw error;
    }

    // DB-Record erstellen
    await supabase.from("documents").insert({
      name: fileName,
      project_id: projectId,
      typ: type,
      sub_type: tabs.find(t => t.key === activeTab)?.subType || null,
      file_url: filePath,
      user_id: user.id,
      archived: false,
    });

    toast({ title: "Bearbeitetes Bild gespeichert" });
    setEditingImage(null);
    setLightboxImage(null);
    fetchFiles();
    fetchDocRecords();
  };

  const handleArchiveSelected = async () => {
    if (selectedFiles.size === 0) return;
    const fileNames = Array.from(selectedFiles);
    // Update DB-Records auf archived=true
    for (const fileName of fileNames) {
      const filePath = `${projectId}/${fileName}`;
      await supabase.from("documents").update({ archived: true }).eq("file_url", filePath);
    }
    toast({ title: `${fileNames.length} Datei(en) archiviert` });
    setSelectedFiles(new Set());
    fetchDocRecords();
  };

  const handleUnarchiveSelected = async () => {
    if (selectedFiles.size === 0) return;
    const fileNames = Array.from(selectedFiles);
    for (const fileName of fileNames) {
      const filePath = `${projectId}/${fileName}`;
      await supabase.from("documents").update({ archived: false }).eq("file_url", filePath);
    }
    toast({ title: `${fileNames.length} Datei(en) wiederhergestellt` });
    setSelectedFiles(new Set());
    fetchDocRecords();
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.size === 0) return;
    // Download einzeln (kein JSZip noetig)
    for (const fileName of Array.from(selectedFiles)) {
      const url = signedUrls[fileName];
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
      }
    }
    toast({ title: `${selectedFiles.size} Datei(en) werden heruntergeladen` });
  };

  const handleFileOpen = (file: StorageFile) => {
    setViewerState({ open: true, fileName: file.name, filePath: `${projectId}/${file.name}` });
  };

  const toggleFileSelection = (fileName: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  };

  const toggleSelectAll = (fileList: StorageFile[]) => {
    if (selectedFiles.size === fileList.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(fileList.map((f) => f.name)));
    }
  };

  // Filter files based on active tab
  const getFilteredFiles = (): StorageFile[] => {
    const isArchivTab = activeTab === "archiv";
    const currentTabConfig = tabs.find((t) => t.key === activeTab);

    return files.filter((file) => {
      const docRecord = docRecords.find((d) => d.name === file.name || d.file_url === `${projectId}/${file.name}`);
      const isArchived = docRecord?.archived === true;

      if (isArchivTab) return isArchived;

      // Nicht-archivierte Dateien
      if (isArchived) return false;

      // Sub-Type Filter (fuer Plaene)
      if (currentTabConfig?.subType) {
        return docRecord?.sub_type === currentTabConfig.subType;
      }

      // Dateien ohne Sub-Type oder passend
      if (type === "plans" && !currentTabConfig?.subType) {
        // "Aktuelle Plaene" = sub_type "plan" oder null
        return !docRecord?.sub_type || docRecord.sub_type === "plan";
      }

      return true;
    });
  };

  if (!type) return <div>Ungueltiger Dokumenttyp</div>;
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;

  const filteredFiles = getFilteredFiles()
    .filter((f) => {
      if (!dateFilter) return true;
      return f.created_at.startsWith(dateFilter);
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

  // Alle Bilder fuer Lightbox-Swipe
  const imageFiles = filteredFiles.filter(f => f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i));
  const isArchivTab = activeTab === "archiv";
  const currentTabConfig = tabs.find((t) => t.key === activeTab);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={`${projectName} - ${titleMap[type]}`} backPath={`/projects/${projectId}`} />

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{titleMap[type]}</CardTitle>
            <CardDescription>{files.length} Dateien gesamt</CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedFiles(new Set()); }}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} className="text-xs sm:text-sm">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {tabs.map((tab) => (
                <TabsContent key={tab.key} value={tab.key}>
                  {/* Upload - nur im aktiven Tab, nicht im Archiv */}
                  {!isArchivTab && (isAdmin || type === "photos") && (
                    <div className="mb-4">
                      <label htmlFor={`file-upload-${tab.key}`} className="cursor-pointer">
                        <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm font-medium">
                            {uploading ? "Lädt hoch..." : "Dateien auswählen oder hierher ziehen"}
                          </p>
                        </div>
                      </label>
                      <Input
                        id={`file-upload-${tab.key}`}
                        type="file"
                        onChange={(e) => handleUpload(e, currentTabConfig?.subType)}
                        disabled={uploading}
                        multiple
                        className="hidden"
                        accept={type === "photos" ? "image/*" : "*"}
                      />
                    </div>
                  )}

                  {/* Aktions-Leiste bei Auswahl */}
                  {selectedFiles.size > 0 && (
                    <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg">
                      <Badge variant="secondary">{selectedFiles.size} ausgewählt</Badge>
                      {!isArchivTab && (
                        <Button size="sm" variant="outline" onClick={handleArchiveSelected}>
                          <Archive className="h-3.5 w-3.5 mr-1" /> Archivieren
                        </Button>
                      )}
                      {isArchivTab && (
                        <Button size="sm" variant="outline" onClick={handleUnarchiveSelected}>
                          Wiederherstellen
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={handleBulkDownload}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Herunterladen
                      </Button>
                      {isAdmin && (
                        <Button size="sm" variant="destructive" onClick={async () => {
                          for (const fn of Array.from(selectedFiles)) {
                            const file = files.find(f => f.name === fn);
                            if (file) await handleDelete(file);
                          }
                          setSelectedFiles(new Set());
                        }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Loeschen
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Alle auswählen + Sortierung */}
                  {filteredFiles.length > 0 && (
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <button
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSelectAll(filteredFiles)}
                      >
                        {selectedFiles.size === filteredFiles.length
                          ? <CheckSquare className="h-4 w-4" />
                          : <Square className="h-4 w-4" />}
                        Alle auswählen
                      </button>
                      <div className="flex items-center gap-2">
                        <input
                          type="month"
                          value={dateFilter}
                          onChange={(e) => setDateFilter(e.target.value)}
                          className="text-xs border rounded px-1.5 py-0.5 bg-background"
                          placeholder="Filter..."
                        />
                        {dateFilter && (
                          <button className="text-xs text-destructive" onClick={() => setDateFilter("")}>Alle</button>
                        )}
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
                        >
                          {sortOrder === "desc" ? "Neueste zuerst" : "Aelteste zuerst"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dateiliste */}
                  {filteredFiles.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {isArchivTab ? "Kein Archiv vorhanden" : "Keine Dateien"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredFiles.map((file) => (
                        <div
                          key={file.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            selectedFiles.has(file.name) ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-accent/50"
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            className="shrink-0"
                            onClick={() => toggleFileSelection(file.name)}
                          >
                            {selectedFiles.has(file.name)
                              ? <CheckSquare className="h-5 w-5 text-primary" />
                              : <Square className="h-5 w-5 text-muted-foreground" />}
                          </button>

                          {/* Thumbnail */}
                          {urlsLoading ? (
                            <div className="w-10 h-10 bg-muted animate-pulse rounded shrink-0" />
                          ) : signedUrls[file.name] && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img src={signedUrls[file.name]} alt={file.name}
                              className="w-10 h-10 object-cover rounded shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <FileText className="w-10 h-10 text-muted-foreground shrink-0" />
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                            if (file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) && signedUrls[file.name]) {
                              setLightboxImage(signedUrls[file.name]);
                            } else {
                              handleFileOpen(file);
                            }
                          }}>
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(file.created_at).toLocaleDateString("de-DE")}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleFileOpen(file)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(file)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Nachkalkulation nur im Polierordner */}
        {type === "polier" && projectId && (
          <div className="mt-4">
            <Nachkalkulation projectId={projectId} />
          </div>
        )}
      </main>

      {/* Bild-Lightbox mit Swipe */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 bg-black/95">
          <div className="flex justify-between items-center px-4 py-2">
            <span className="text-white text-sm">Bild-Vorschau</span>
            <div className="flex gap-2">
              {lightboxImage && (
                <>
                  <button
                    onClick={() => setEditingImage(lightboxImage)}
                    className="text-white hover:text-gray-300 flex items-center gap-1 px-2 py-1 bg-white/10 rounded"
                    title="Bild bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="text-xs hidden sm:inline">Bearbeiten</span>
                  </button>
                  <a href={lightboxImage} download className="text-white hover:text-gray-300">
                    <Download className="h-5 w-5" />
                  </a>
                </>
              )}
              <button onClick={() => setLightboxImage(null)} className="text-white hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {lightboxImage && <img src={lightboxImage} alt="Vorschau" className="max-w-full max-h-full object-contain rounded-lg" />}
          </div>
          {imageFiles.length > 1 && (() => {
            const allUrls = imageFiles.map(f => signedUrls[f.name]).filter(Boolean);
            const idx = lightboxImage ? allUrls.indexOf(lightboxImage) : -1;
            return (
              <div className="flex justify-center gap-4 pb-4">
                <button className="text-white disabled:opacity-30" disabled={idx <= 0} onClick={() => setLightboxImage(allUrls[idx - 1])}>
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <span className="text-white text-sm self-center">{idx + 1} / {allUrls.length}</span>
                <button className="text-white disabled:opacity-30" disabled={idx >= allUrls.length - 1} onClick={() => setLightboxImage(allUrls[idx + 1])}>
                  <ChevronRight className="h-8 w-8" />
                </button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <FileViewer
        open={viewerState.open}
        onClose={() => setViewerState({ open: false, fileName: "", filePath: "" })}
        fileName={viewerState.fileName}
        filePath={viewerState.filePath}
        bucketName={type ? bucketMap[type] : ""}
      />

      {/* Image Editor */}
      {editingImage && (
        <ImageEditor
          open={!!editingImage}
          onClose={() => setEditingImage(null)}
          imageUrl={editingImage}
          onSave={handleEditedImageSave}
          title="Bild bearbeiten"
        />
      )}
    </div>
  );
};

export default ProjectDetail;
