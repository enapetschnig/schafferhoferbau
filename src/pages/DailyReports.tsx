import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Filter, Download, CheckSquare, Square, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { generateDailyReportPDF } from "@/lib/generateDailyReportPDF";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DailyReportForm } from "@/components/DailyReportForm";
import { ZettelUploadDialog } from "@/components/ZettelUploadDialog";
import { Upload } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type DailyReport = {
  id: string;
  user_id: string;
  project_id: string;
  report_type: string;
  datum: string;
  temperatur_min: number | null;
  temperatur_max: number | null;
  wetter: string[] | null;
  status: string;
  created_at: string;
  projects: { name: string; plz: string | null } | null;
};

const WETTER_ICONS: Record<string, string> = {
  sonnig: "☀️", bewoelkt: "☁️", regen: "🌧️", schnee: "❄️", wind: "💨", frost: "🥶",
};

const STATUS_COLORS: Record<string, string> = {
  offen: "bg-yellow-100 text-yellow-800",
  gesendet: "bg-blue-100 text-blue-800",
  abgeschlossen: "bg-green-100 text-green-800",
};

export default function DailyReports() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get("project");
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showZettelUpload, setShowZettelUpload] = useState(false);
  const [filterType, setFilterType] = useState<string>("alle");
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [filterGeschoss, setFilterGeschoss] = useState<string>("alle");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterSignature, setFilterSignature] = useState<"alle" | "ja" | "nein">("alle");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [showBulkDownloadDialog, setShowBulkDownloadDialog] = useState(false);
  const [bulkIncludeIntern, setBulkIncludeIntern] = useState(false);
  const [bulkIncludeHours, setBulkIncludeHours] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("daily_reports")
      .select("*, projects(name, plz)")
      .order("datum", { ascending: sortOrder === "asc" });

    if (projectFilter) {
      query = query.eq("project_id", projectFilter);
    }
    if (filterType !== "alle") {
      query = query.eq("report_type", filterType);
    }
    if (filterStatus !== "alle") {
      query = query.eq("status", filterStatus);
    }
    if (filterDateFrom) {
      query = query.gte("datum", filterDateFrom);
    }
    if (filterDateTo) {
      query = query.lte("datum", filterDateTo);
    }

    const { data, error } = await query;
    if (error) {
      toast({ variant: "destructive", title: "Fehler beim Laden", description: error.message });
    }
    if (data) {
      let filtered = data as any[];
      if (filterGeschoss !== "alle") {
        // geschoss ist ein TEXT[] — exakter Array-Vergleich, damit z.B. "EG"
        // nicht faelschlicherweise einen "EG1"-Eintrag matcht
        filtered = filtered.filter((r: any) =>
          Array.isArray(r.geschoss) && r.geschoss.includes(filterGeschoss)
        );
      }
      if (filterSignature !== "alle") {
        filtered = filtered.filter((r: any) => filterSignature === "ja"
          ? !!r.unterschrift_kunde
          : !r.unterschrift_kunde);
      }
      setReports(filtered);
    }
    setLoading(false);
  }, [filterType, filterStatus, filterGeschoss, projectFilter, filterDateFrom, filterDateTo, filterSignature, sortOrder]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleBulkDownload = async () => {
    if (selectedReports.size === 0) return;
    setBulkDownloading(true);
    try {
      const ids = Array.from(selectedReports);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      let ok = 0;
      for (const id of ids) {
        try {
          const { data: report } = await supabase
            .from("daily_reports")
            .select("*, projects(name, adresse, plz)")
            .eq("id", id)
            .single();
          if (!report) continue;
          const { data: activities } = await supabase
            .from("daily_report_activities")
            .select("geschoss, beschreibung")
            .eq("daily_report_id", id)
            .order("sort_order");
          const { data: photos } = await supabase
            .from("daily_report_photos")
            .select("file_path, file_name")
            .eq("daily_report_id", id);

          // Optional: interne Anmerkungen raus wenn nicht gewollt
          const reportForPdf = { ...report, project: report.projects } as any;
          if (!bulkIncludeIntern) {
            reportForPdf.interne_anmerkungen = null;
            reportForPdf.notizen = null;
          }
          await generateDailyReportPDF(
            reportForPdf,
            (activities || []) as any,
            (photos || []) as any,
            supabaseUrl
          );
          ok++;
        } catch (err: any) {
          console.error(`PDF-Fehler fuer ${id}:`, err);
        }
      }
      toast({ title: `${ok} PDF(s) heruntergeladen` });
      setShowBulkDownloadDialog(false);
      setSelectedReports(new Set());
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedReports.size === 0) return;
    const count = selectedReports.size;
    if (!window.confirm(`${count} Bericht${count === 1 ? "" : "e"} wirklich unwiderruflich löschen?`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedReports);
      let ok = 0;
      for (const id of ids) {
        // Fotos aus Storage entfernen
        const { data: photos } = await supabase
          .from("daily_report_photos")
          .select("file_path")
          .eq("daily_report_id", id);
        if (photos && photos.length > 0) {
          await supabase.storage
            .from("daily-report-photos")
            .remove(photos.map((p: any) => p.file_path));
        }
        // Report loeschen (Activities + Photos haengen per FK; falls ohne Cascade: vorher loeschen)
        await supabase.from("daily_report_activities").delete().eq("daily_report_id", id);
        await supabase.from("daily_report_photos").delete().eq("daily_report_id", id);
        const { error } = await supabase.from("daily_reports").delete().eq("id", id);
        if (!error) ok++;
      }
      toast({ title: `${ok} Bericht${ok === 1 ? "" : "e"} gelöscht` });
      setSelectedReports(new Set());
      fetchReports();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler beim Löschen", description: err?.message });
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <PageHeader title="Berichte" backPath={projectFilter ? `/projects/${projectFilter}` : undefined} />

      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <div className="flex gap-2 flex-wrap">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Typen</SelectItem>
              <SelectItem value="tagesbericht">Tagesbericht</SelectItem>
              <SelectItem value="regiebericht">Regiebericht</SelectItem>
              <SelectItem value="zwischenbericht">Zwischenbericht</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="offen">Offen</SelectItem>
              <SelectItem value="gesendet">Gesendet</SelectItem>
              <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterGeschoss} onValueChange={setFilterGeschoss}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Geschosse</SelectItem>
              <SelectItem value="aussen">Außen</SelectItem>
              <SelectItem value="keller">Keller</SelectItem>
              <SelectItem value="eg">EG</SelectItem>
              <SelectItem value="og">OG</SelectItem>
              <SelectItem value="dg">DG</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? "Weniger Filter" : "Mehr Filter"}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowZettelUpload(true)}>
            <Upload className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Zettel hochladen</span>
            <span className="sm:hidden">Zettel</span>
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Neuer Bericht
          </Button>
        </div>
      </div>

      {selectedReports.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-lg flex-wrap">
          <Badge variant="secondary">{selectedReports.size} ausgewählt</Badge>
          <Button size="sm" variant="outline" onClick={() => setShowBulkDownloadDialog(true)} disabled={bulkDeleting}>
            <Download className="h-3.5 w-3.5 mr-1" /> Als PDF herunterladen
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
            {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
            Löschen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedReports(new Set())} disabled={bulkDeleting}>
            Auswahl aufheben
          </Button>
        </div>
      )}

      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Von Datum</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Bis Datum</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Kundenunterschrift</Label>
              <Select value={filterSignature} onValueChange={(v) => setFilterSignature(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="ja">Vorhanden (grün)</SelectItem>
                  <SelectItem value="nein">Fehlt (rot)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reihenfolge</Label>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Zuletzt zuerst</SelectItem>
                  <SelectItem value="asc">Zuerst zuerst</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 md:col-span-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterDateFrom("");
                  setFilterDateTo("");
                  setFilterSignature("alle");
                  setSortOrder("desc");
                  setFilterGeschoss("alle");
                  setFilterStatus("alle");
                  setFilterType("alle");
                }}
              >
                Filter zurücksetzen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Lade...</p>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mb-4" />
            <p>Keine Berichte vorhanden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card
              key={report.id}
              className={`cursor-pointer hover:shadow-md transition-shadow ${selectedReports.has(report.id) ? "border-primary" : ""}`}
              onClick={() => navigate(`/daily-reports/${report.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="shrink-0 mt-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedReports((prev) => {
                        const next = new Set(prev);
                        if (next.has(report.id)) next.delete(report.id);
                        else next.add(report.id);
                        return next;
                      });
                    }}
                  >
                    {selectedReports.has(report.id)
                      ? <CheckSquare className="h-5 w-5 text-primary" />
                      : <Square className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {format(new Date(report.datum), "EEEE, dd.MM.yyyy", { locale: de })}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {report.report_type === "regiebericht" ? "Regiebericht" : report.report_type === "tagesbericht" ? "Tagesbericht" : "Zwischenbericht"}
                      </Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[report.status] || ""}`}>
                        {report.status === "offen" ? "Offen" : report.status === "gesendet" ? "Gesendet" : "Abgeschlossen"}
                      </Badge>
                      {report.unterschrift_kunde ? (
                        <Badge className="text-xs bg-green-100 text-green-800">Kunde unterschrieben</Badge>
                      ) : report.status === "gesendet" ? (
                        <Badge className="text-xs bg-red-100 text-red-800">Keine Unterschrift</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(report.projects as any)?.name || "Unbekanntes Projekt"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {report.wetter && report.wetter.map((w) => (
                        <span key={w}>{WETTER_ICONS[w] || w}</span>
                      ))}
                      {report.temperatur_min != null && report.temperatur_max != null && (
                        <span>{report.temperatur_min}°/{report.temperatur_max}°C</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DailyReportForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={fetchReports}
        defaultProjectId={projectFilter ?? undefined}
      />

      <ZettelUploadDialog
        open={showZettelUpload}
        onOpenChange={setShowZettelUpload}
        onSuccess={fetchReports}
        defaultProjectId={projectFilter ?? undefined}
      />

      {/* Bulk-PDF Dialog */}
      <Dialog open={showBulkDownloadDialog} onOpenChange={(o) => !bulkDownloading && setShowBulkDownloadDialog(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedReports.size} Berichte als PDF herunterladen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Was soll in den PDF-Dokumenten enthalten sein?
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={bulkIncludeIntern} onCheckedChange={(v) => setBulkIncludeIntern(!!v)} />
              <span className="text-sm">Interne Anmerkungen + Notizen einschließen</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={bulkIncludeHours} onCheckedChange={(v) => setBulkIncludeHours(!!v)} />
              <span className="text-sm">Stunden der Mitarbeiter einschließen</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Ohne Haken: saubere Kunden-Version ohne interne Infos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDownloadDialog(false)} disabled={bulkDownloading}>
              Abbrechen
            </Button>
            <Button onClick={handleBulkDownload} disabled={bulkDownloading}>
              {bulkDownloading
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Erstellt...</>
                : <><Download className="w-4 h-4 mr-1" /> Herunterladen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
