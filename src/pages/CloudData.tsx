import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Database, HardDrive, FileText, Image, Users, FolderOpen, Clock, Package, Shield,
  ArrowLeft, ChevronRight, Folder, File as FileIcon, Download, Trash2, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { FileViewer } from "@/components/FileViewer";
import { useToast } from "@/hooks/use-toast";

type StorageInfo = {
  bucket: string;
  label: string;
  icon: React.ReactNode;
  fileCount: number;
  sizeEstimate: string;
};
type TableInfo = { name: string; label: string; icon: React.ReactNode; count: number };

type EntryItem = {
  name: string;
  isFolder: boolean;
  size?: number | null;
  updated_at?: string;
};

const BUCKETS = [
  { bucket: "project-photos", label: "Projekt-Fotos", icon: <Image className="h-5 w-5 text-blue-500" /> },
  { bucket: "project-plans", label: "Pläne & Aufträge", icon: <FileText className="h-5 w-5 text-green-500" /> },
  { bucket: "project-reports", label: "Regieberichte", icon: <FileText className="h-5 w-5 text-orange-500" /> },
  { bucket: "project-chef", label: "Chefordner", icon: <FolderOpen className="h-5 w-5 text-red-500" /> },
  { bucket: "project-polier", label: "Polierordner", icon: <FolderOpen className="h-5 w-5 text-amber-500" /> },
  { bucket: "employee-documents", label: "Mitarbeiter-Dokumente", icon: <Users className="h-5 w-5 text-purple-500" /> },
  { bucket: "document-library", label: "Dokumentenbibliothek", icon: <FileText className="h-5 w-5 text-teal-500" /> },
  { bucket: "bestellungen", label: "Bestellungen", icon: <Package className="h-5 w-5 text-indigo-500" /> },
  { bucket: "equipment-photos", label: "Geräte-Fotos & Dokumente", icon: <Shield className="h-5 w-5 text-zinc-500" /> },
  { bucket: "incoming-documents", label: "Eingangsrechnungen", icon: <FileText className="h-5 w-5 text-rose-500" /> },
  { bucket: "broadcast-chat", label: "Firmen-Chat-Anhänge", icon: <FileText className="h-5 w-5 text-cyan-500" /> },
  { bucket: "project-chat", label: "Projekt-Chat-Anhänge", icon: <FileText className="h-5 w-5 text-sky-500" /> },
  { bucket: "disturbance-photos", label: "Stoerungs-Fotos", icon: <Image className="h-5 w-5 text-yellow-600" /> },
  { bucket: "daily-report-photos", label: "Tagesbericht-Fotos", icon: <Image className="h-5 w-5 text-lime-500" /> },
  { bucket: "warehouse-documents", label: "Lager-Dokumente", icon: <FileText className="h-5 w-5 text-violet-500" /> },
  { bucket: "safety-materials", label: "Sicherheits-Unterlagen", icon: <Shield className="h-5 w-5 text-emerald-500" /> },
];

const isImageName = (n: string) => /\.(jpe?g|png|gif|webp)$/i.test(n);
const isPdfName = (n: string) => /\.pdf$/i.test(n);
const formatBytes = (b: number | null | undefined): string => {
  if (!b || b <= 0) return "–";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(b) / Math.log(k)));
  return `${(b / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
};

export default function CloudData() {
  const { toast } = useToast();
  const [storageData, setStorageData] = useState<StorageInfo[]>([]);
  const [tableData, setTableData] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Browser-State
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(""); // ohne fuehrenden Slash, mit trailing Slash bei Foldern
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [search, setSearch] = useState("");

  // FileViewer
  const [viewer, setViewer] = useState<{ open: boolean; fileName: string; filePath: string; bucket: string }>({
    open: false, fileName: "", filePath: "", bucket: "",
  });

  // Initial: Statistiken laden
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storageResults: StorageInfo[] = [];
      for (const b of BUCKETS) {
        try {
          const { data } = await supabase.storage.from(b.bucket).list("", { limit: 1000 });
          let totalFiles = 0;
          if (data) {
            for (const folder of data) {
              if (folder.id) { totalFiles++; continue; }
              const { data: subFiles } = await supabase.storage.from(b.bucket).list(folder.name, { limit: 1000 });
              totalFiles += subFiles?.filter((f) => f.name !== ".emptyFolderPlaceholder").length || 0;
            }
          }
          storageResults.push({
            ...b,
            fileCount: totalFiles,
            sizeEstimate: totalFiles > 0 ? `~${Math.ceil(totalFiles * 0.5)} MB` : "0 MB",
          });
        } catch {
          storageResults.push({ ...b, fileCount: 0, sizeEstimate: "Kein Zugriff" });
        }
      }
      if (cancelled) return;
      setStorageData(storageResults);

      const tables = [
        { name: "projects", label: "Projekte", icon: <FolderOpen className="h-4 w-4" /> },
        { name: "profiles", label: "Benutzer", icon: <Users className="h-4 w-4" /> },
        { name: "employees", label: "Mitarbeiter", icon: <Users className="h-4 w-4" /> },
        { name: "time_entries", label: "Stundeneintraege", icon: <Clock className="h-4 w-4" /> },
        { name: "daily_reports", label: "Berichte", icon: <FileText className="h-4 w-4" /> },
        { name: "worker_assignments", label: "Plantafel-Zuweisungen", icon: <Clock className="h-4 w-4" /> },
        { name: "project_contacts", label: "Projektkontakte", icon: <Users className="h-4 w-4" /> },
        { name: "project_messages", label: "Chat-Nachrichten", icon: <FileText className="h-4 w-4" /> },
        { name: "incoming_documents", label: "Eingangsrechnungen", icon: <FileText className="h-4 w-4" /> },
        { name: "bestellungen", label: "Bestellungen", icon: <Package className="h-4 w-4" /> },
        { name: "equipment", label: "Geraete", icon: <Shield className="h-4 w-4" /> },
        { name: "notifications", label: "Benachrichtigungen", icon: <FileText className="h-4 w-4" /> },
      ];
      const tableResults: TableInfo[] = [];
      for (const t of tables) {
        const { count } = await supabase.from(t.name as any).select("*", { count: "exact", head: true });
        tableResults.push({ ...t, count: count || 0 });
      }
      if (!cancelled) setTableData(tableResults);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Bucket-Inhalt laden
  const loadEntries = useCallback(async (bucket: string, path: string) => {
    setEntriesLoading(true);
    try {
      const { data, error } = await supabase.storage.from(bucket).list(path, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const list: EntryItem[] = (data || [])
        .filter((e) => e.name !== ".emptyFolderPlaceholder")
        .map((e) => ({
          name: e.name,
          isFolder: !e.id, // Supabase: Folder hat keine id
          size: (e.metadata as any)?.size,
          updated_at: e.updated_at || e.created_at,
        }));
      // Folders zuerst, dann Files
      list.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(list);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err?.message || "Liste konnte nicht geladen werden" });
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedBucket) {
      void loadEntries(selectedBucket, currentPath);
    }
  }, [selectedBucket, currentPath, loadEntries]);

  const enterFolder = (folderName: string) => {
    setCurrentPath((prev) => `${prev}${folderName}/`);
  };

  const goUp = () => {
    if (!currentPath) {
      setSelectedBucket(null);
      return;
    }
    const trimmed = currentPath.replace(/\/$/, "");
    const lastSlash = trimmed.lastIndexOf("/");
    setCurrentPath(lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : "");
  };

  const goToBucketRoot = () => {
    setCurrentPath("");
  };

  const openFile = (entry: EntryItem) => {
    if (!selectedBucket) return;
    const filePath = `${currentPath}${entry.name}`;
    setViewer({ open: true, fileName: entry.name, filePath, bucket: selectedBucket });
  };

  const downloadFile = async (entry: EntryItem) => {
    if (!selectedBucket) return;
    const filePath = `${currentPath}${entry.name}`;
    const { data, error } = await supabase.storage.from(selectedBucket).download(filePath);
    if (error || !data) {
      toast({ variant: "destructive", title: "Download fehlgeschlagen", description: error?.message });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteFile = async (entry: EntryItem) => {
    if (!selectedBucket) return;
    if (!confirm(`Datei "${entry.name}" wirklich endgueltig loeschen?`)) return;
    const filePath = `${currentPath}${entry.name}`;
    const { error } = await supabase.storage.from(selectedBucket).remove([filePath]);
    if (error) {
      toast({ variant: "destructive", title: "Loeschen fehlgeschlagen", description: error.message });
      return;
    }
    toast({ title: "Geloescht", description: entry.name });
    void loadEntries(selectedBucket, currentPath);
  };

  const totalFiles = storageData.reduce((s, b) => s + b.fileCount, 0);
  const totalRecords = tableData.reduce((s, t) => s + t.count, 0);

  const filteredEntries = search.trim()
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const breadcrumbs = currentPath
    .split("/")
    .filter(Boolean)
    .map((seg, idx, all) => ({ seg, path: all.slice(0, idx + 1).join("/") + "/" }));

  // ─────────── Datei-Browser-Ansicht ───────────
  if (selectedBucket) {
    const bucketMeta = BUCKETS.find((b) => b.bucket === selectedBucket);
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title={bucketMeta?.label || selectedBucket} backPath="/cloud-data" />
        <main className="container mx-auto px-4 py-6 max-w-4xl">
          {/* Breadcrumb + Aktionen */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedBucket(null); setCurrentPath(""); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Buckets
            </Button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={goToBucketRoot}
              className="text-sm font-medium hover:underline"
            >
              {bucketMeta?.label || selectedBucket}
            </button>
            {breadcrumbs.map((bc, i) => (
              <div key={bc.path} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setCurrentPath(bc.path)}
                  className="text-sm hover:underline"
                  title={bc.path}
                >
                  {bc.seg.length > 12 ? `${bc.seg.slice(0, 8)}…` : bc.seg}
                </button>
              </div>
            ))}
          </div>

          {/* Suche */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="In diesem Ordner suchen..."
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              {entriesLoading ? (
                <p className="text-center text-muted-foreground py-8">Lade...</p>
              ) : filteredEntries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {search ? "Nichts gefunden" : "Dieser Ordner ist leer"}
                </p>
              ) : (
                <div className="divide-y">
                  {currentPath && (
                    <button
                      type="button"
                      onClick={goUp}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                    >
                      <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">.. (Eine Ebene hoch)</span>
                    </button>
                  )}
                  {filteredEntries.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-3 p-3 hover:bg-muted/30">
                      <button
                        type="button"
                        onClick={() => entry.isFolder ? enterFolder(entry.name) : openFile(entry)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        {entry.isFolder ? (
                          <Folder className="h-5 w-5 text-amber-500 shrink-0" />
                        ) : isImageName(entry.name) ? (
                          <Image className="h-5 w-5 text-blue-500 shrink-0" />
                        ) : isPdfName(entry.name) ? (
                          <FileText className="h-5 w-5 text-red-500 shrink-0" />
                        ) : (
                          <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{entry.name}</p>
                          {!entry.isFolder && (
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(entry.size)}
                              {entry.updated_at && ` · ${new Date(entry.updated_at).toLocaleDateString("de-DE")}`}
                            </p>
                          )}
                        </div>
                      </button>
                      {!entry.isFolder && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => downloadFile(entry)}
                            title="Herunterladen"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => deleteFile(entry)}
                            title="Loeschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        <FileViewer
          open={viewer.open}
          onClose={() => setViewer((v) => ({ ...v, open: false }))}
          fileName={viewer.fileName}
          filePath={viewer.filePath}
          bucketName={viewer.bucket}
          onPdfSaved={() => loadEntries(selectedBucket!, currentPath)}
        />
      </div>
    );
  }

  // ─────────── Buckets-Übersicht ───────────
  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Cloud-Daten" backPath="/" />
      <main className="container mx-auto px-4 py-6 max-w-4xl">

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Daten werden geladen...</p>
        ) : (
          <>
            {/* Zusammenfassung */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <HardDrive className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{totalFiles}</p>
                    <p className="text-sm text-muted-foreground">Dateien in der Cloud</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Database className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{totalRecords.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Datenbankeintraege</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Storage Buckets - klickbar */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Dateispeicher
                </CardTitle>
                <CardDescription>
                  Klicke auf einen Bereich, um die Dateien zu durchsuchen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {storageData.map((b) => (
                  <button
                    type="button"
                    key={b.bucket}
                    onClick={() => { setSelectedBucket(b.bucket); setCurrentPath(""); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {b.icon}
                      <span className="text-sm font-medium">{b.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{b.fileCount} Dateien</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Database Tables */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Datenbank
                </CardTitle>
                <CardDescription>
                  Strukturierte Daten (Projekte, Stunden, Berichte, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {tableData.map((t) => (
                  <div key={t.name} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {t.icon}
                      <span className="text-sm font-medium">{t.label}</span>
                    </div>
                    <Badge variant="secondary">{t.count.toLocaleString()} Eintraege</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Alle Daten werden in der Supabase Cloud (EU-Server) gespeichert.
              Fuer Fragen zur Datenspeicherung wenden Sie sich an den Administrator.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
