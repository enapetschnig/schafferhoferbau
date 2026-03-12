import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DocumentCaptureDialog } from "@/components/DocumentCaptureDialog";
import { DocumentDetailDialog, type IncomingDocument } from "@/components/DocumentDetailDialog";
import { Download, Plus, Filter, FileText, Receipt } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import * as XLSX from "xlsx-js-style";

const monthNames = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const TYP_LABELS: Record<string, { label: string; color: string }> = {
  lieferschein: { label: "Lieferschein", color: "bg-blue-100 text-blue-800" },
  lagerlieferschein: { label: "Lagerliefersch.", color: "bg-yellow-100 text-yellow-800" },
  rechnung: { label: "Rechnung", color: "bg-purple-100 text-purple-800" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  offen: { label: "Offen", color: "bg-red-100 text-red-800" },
  bezahlt: { label: "Bezahlt", color: "bg-green-100 text-green-800" },
  storniert: { label: "Storniert", color: "bg-gray-100 text-gray-800" },
};

export default function IncomingDocuments() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const now = new Date();

  const [documents, setDocuments] = useState<IncomingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [filterTyp, setFilterTyp] = useState("alle");
  const [filterStatus, setFilterStatus] = useState("alle");
  const [filterProject, setFilterProject] = useState(searchParams.get("project") || "alle");
  const [filterLieferant, setFilterLieferant] = useState("");
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());

  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<IncomingDocument | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [filterMonth, filterYear]);

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchDocuments = useCallback(async () => {
    setLoading(true);

    const startDate = new Date(filterYear, filterMonth - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(filterYear, filterMonth, 0).toISOString().split("T")[0];

    let query = supabase
      .from("incoming_documents")
      .select("*, projects(name)")
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59`)
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Dokumente konnten nicht geladen werden" });
      setLoading(false);
      return;
    }

    if (data) {
      // Fetch employee names
      const userIds = [...new Set(data.map((d: any) => d.user_id))];
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id, vorname, nachname")
        .in("user_id", userIds);

      const nameMap: Record<string, string> = {};
      empData?.forEach((e: any) => {
        if (e.user_id) nameMap[e.user_id] = `${e.vorname} ${e.nachname}`.trim();
      });

      setDocuments(
        data.map((d: any) => ({
          ...d,
          project_name: d.projects?.name || "–",
          employee_name: nameMap[d.user_id] || "–",
        }))
      );
    }

    setLoading(false);
  }, [filterMonth, filterYear]);

  // Apply client-side filters
  const filtered = documents.filter((doc) => {
    if (filterTyp !== "alle" && doc.typ !== filterTyp) return false;
    if (filterStatus !== "alle" && doc.status !== filterStatus) return false;
    if (filterProject !== "alle" && doc.project_id !== filterProject) return false;
    if (filterLieferant && doc.lieferant && !doc.lieferant.toLowerCase().includes(filterLieferant.toLowerCase())) return false;
    if (filterLieferant && !doc.lieferant) return false;
    return true;
  });

  // Stats
  const offeneLieferscheine = documents.filter(d => d.status === "offen" && (d.typ === "lieferschein" || d.typ === "lagerlieferschein")).length;
  const offeneRechnungen = documents.filter(d => d.status === "offen" && d.typ === "rechnung").length;

  const exportToExcel = () => {
    const rows: (string | number)[][] = [
      ["Lieferscheine & Rechnungen", "", "", "", "", "", ""],
      [`${monthNames[filterMonth - 1]} ${filterYear}`, "", "", "", "", "", ""],
      [],
      ["Datum", "Typ", "Lieferant", "Belegnr.", "Projekt", "Betrag", "Status", "Mitarbeiter"],
    ];

    for (const doc of filtered) {
      rows.push([
        doc.dokument_datum ? format(parseISO(doc.dokument_datum), "dd.MM.yyyy") : "–",
        TYP_LABELS[doc.typ]?.label || doc.typ,
        doc.lieferant || "–",
        doc.dokument_nummer || "–",
        doc.project_name || "–",
        doc.typ !== "rechnung" && doc.betrag != null ? Number(doc.betrag) : 0,
        STATUS_LABELS[doc.status]?.label || doc.status,
        doc.employee_name || "–",
      ]);
    }

    rows.push([]);
    rows.push(["", "", "", "", "GESAMT", filtered.reduce((s, d) => s + (d.typ !== "rechnung" && d.betrag ? Number(d.betrag) : 0), 0), "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dokumente");
    XLSX.writeFile(wb, `Lieferscheine_Rechnungen_${monthNames[filterMonth - 1]}_${filterYear}.xlsx`);
    toast({ title: "Exportiert", description: "Excel-Datei wurde heruntergeladen" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader title="Lieferscheine & Rechnungen" backPath="/" />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Lieferscheine</CardDescription>
              <CardTitle className="text-2xl">{offeneLieferscheine}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Rechnungen</CardDescription>
              <CardTitle className="text-2xl">{offeneRechnungen}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Filter className="w-5 h-5 text-muted-foreground shrink-0" />

                <Select value={filterTyp} onValueChange={setFilterTyp}>
                  <SelectTrigger className="w-[160px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Typen</SelectItem>
                    <SelectItem value="lieferschein">Lieferschein</SelectItem>
                    <SelectItem value="lagerlieferschein">Lagerlieferschein</SelectItem>
                    <SelectItem value="rechnung">Rechnung</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[130px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Status</SelectItem>
                    <SelectItem value="offen">Offen</SelectItem>
                    <SelectItem value="bezahlt">Bezahlt</SelectItem>
                    <SelectItem value="storniert">Storniert</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger className="w-[180px] h-10">
                    <SelectValue placeholder="Alle Projekte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Projekte</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Lieferant..."
                  value={filterLieferant}
                  onChange={(e) => setFilterLieferant(e.target.value)}
                  className="w-[150px] h-10"
                />

                <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
                  <SelectTrigger className="w-[130px] h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((name, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
                  <SelectTrigger className="w-[100px] h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={exportToExcel} disabled={filtered.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
                <Button onClick={() => setShowCaptureDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Erfassen</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Lädt...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Keine Dokumente im ausgewählten Zeitraum</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Lieferant</TableHead>
                      <TableHead className="hidden md:table-cell">Projekt</TableHead>
                      <TableHead className="hidden sm:table-cell">Belegnr.</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((doc) => {
                      const typInfo = TYP_LABELS[doc.typ] || TYP_LABELS.lieferschein;
                      const statusInfo = STATUS_LABELS[doc.status] || STATUS_LABELS.offen;

                      return (
                        <TableRow
                          key={doc.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelectedDoc(doc); setShowDetailDialog(true); }}
                        >
                          <TableCell className="font-mono text-xs">
                            {doc.dokument_datum
                              ? format(parseISO(doc.dokument_datum), "dd.MM.yyyy")
                              : format(new Date(doc.created_at), "dd.MM.yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge className={typInfo.color + " text-xs"}>{typInfo.label}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{doc.lieferant || "–"}</TableCell>
                          <TableCell className="hidden md:table-cell">{doc.project_name}</TableCell>
                          <TableCell className="hidden sm:table-cell font-mono text-xs">{doc.dokument_nummer || "–"}</TableCell>
                          <TableCell className="text-right font-medium">
                            {doc.typ !== "rechnung" && doc.betrag != null ? `€ ${Number(doc.betrag).toFixed(2)}` : "–"}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusInfo.color + " text-xs"}>{statusInfo.label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Capture Dialog */}
      <DocumentCaptureDialog
        open={showCaptureDialog}
        onOpenChange={setShowCaptureDialog}
        onSuccess={fetchDocuments}
      />

      {/* Detail Dialog */}
      <DocumentDetailDialog
        document={selectedDoc}
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        isAdmin={false}
        onUpdate={() => { fetchDocuments(); setShowDetailDialog(false); }}
      />
    </div>
  );
}
