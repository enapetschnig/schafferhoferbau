import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, HardDrive, FileText, Image, Users, FolderOpen, Clock, Package, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

type StorageInfo = { bucket: string; label: string; icon: React.ReactNode; fileCount: number; sizeEstimate: string };
type TableInfo = { name: string; label: string; icon: React.ReactNode; count: number };

export default function CloudData() {
  const [storageData, setStorageData] = useState<StorageInfo[]>([]);
  const [tableData, setTableData] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    // Storage Buckets pruefen
    const buckets = [
      { bucket: "project-photos", label: "Projekt-Fotos", icon: <Image className="h-5 w-5 text-blue-500" /> },
      { bucket: "project-plans", label: "Pläne & Aufträge", icon: <FileText className="h-5 w-5 text-green-500" /> },
      { bucket: "project-reports", label: "Regieberichte", icon: <FileText className="h-5 w-5 text-orange-500" /> },
      { bucket: "project-chef", label: "Chefordner", icon: <FolderOpen className="h-5 w-5 text-red-500" /> },
      { bucket: "project-polier", label: "Polierordner", icon: <FolderOpen className="h-5 w-5 text-amber-500" /> },
      { bucket: "employee-documents", label: "Mitarbeiter-Dokumente", icon: <Users className="h-5 w-5 text-purple-500" /> },
      { bucket: "document-library", label: "Dokumentenbibliothek", icon: <FileText className="h-5 w-5 text-teal-500" /> },
      { bucket: "bestellungen", label: "Bestellungen", icon: <Package className="h-5 w-5 text-indigo-500" /> },
    ];

    const storageResults: StorageInfo[] = [];
    for (const b of buckets) {
      try {
        const { data } = await supabase.storage.from(b.bucket).list("", { limit: 1000 });
        // Zaehle Dateien rekursiv (erste Ebene = Projekte/User)
        let totalFiles = 0;
        if (data) {
          for (const folder of data) {
            if (folder.id) { totalFiles++; continue; } // Datei auf Root-Ebene
            const { data: subFiles } = await supabase.storage.from(b.bucket).list(folder.name, { limit: 1000 });
            totalFiles += subFiles?.length || 0;
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
    setStorageData(storageResults);

    // Datenbank-Tabellen zaehlen
    const tables = [
      { name: "projects", label: "Projekte", icon: <FolderOpen className="h-4 w-4" /> },
      { name: "profiles", label: "Benutzer", icon: <Users className="h-4 w-4" /> },
      { name: "employees", label: "Mitarbeiter", icon: <Users className="h-4 w-4" /> },
      { name: "time_entries", label: "Stundeneinträge", icon: <Clock className="h-4 w-4" /> },
      { name: "daily_reports", label: "Berichte", icon: <FileText className="h-4 w-4" /> },
      { name: "worker_assignments", label: "Plantafel-Zuweisungen", icon: <Clock className="h-4 w-4" /> },
      { name: "project_contacts", label: "Projektkontakte", icon: <Users className="h-4 w-4" /> },
      { name: "project_messages", label: "Chat-Nachrichten", icon: <FileText className="h-4 w-4" /> },
      { name: "incoming_documents", label: "Eingangsrechnungen", icon: <FileText className="h-4 w-4" /> },
      { name: "bestellungen", label: "Bestellungen", icon: <Package className="h-4 w-4" /> },
      { name: "equipment", label: "Geräte", icon: <Shield className="h-4 w-4" /> },
      { name: "notifications", label: "Benachrichtigungen", icon: <FileText className="h-4 w-4" /> },
    ];

    const tableResults: TableInfo[] = [];
    for (const t of tables) {
      const { count } = await supabase.from(t.name).select("*", { count: "exact", head: true });
      tableResults.push({ ...t, count: count || 0 });
    }
    setTableData(tableResults);

    setLoading(false);
  };

  const totalFiles = storageData.reduce((s, b) => s + b.fileCount, 0);
  const totalRecords = tableData.reduce((s, t) => s + t.count, 0);

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
                    <p className="text-sm text-muted-foreground">Datenbankeinträge</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Storage Buckets */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Dateispeicher (Storage)
                </CardTitle>
                <CardDescription>
                  Alle hochgeladenen Dateien (Fotos, PDFs, Dokumente)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {storageData.map((b) => (
                  <div key={b.bucket} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {b.icon}
                      <span className="text-sm font-medium">{b.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{b.fileCount} Dateien</Badge>
                      <span className="text-xs text-muted-foreground">{b.sizeEstimate}</span>
                    </div>
                  </div>
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
              Für Fragen zur Datenspeicherung wenden Sie sich an den Administrator.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
