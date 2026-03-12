import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DailyReportForm } from "@/components/DailyReportForm";
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
  const [filterType, setFilterType] = useState<string>("alle");
  const [filterStatus, setFilterStatus] = useState<string>("alle");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("daily_reports")
      .select("*, projects(name, plz)")
      .order("datum", { ascending: false });

    if (projectFilter) {
      query = query.eq("project_id", projectFilter);
    }
    if (filterType !== "alle") {
      query = query.eq("report_type", filterType);
    }
    if (filterStatus !== "alle") {
      query = query.eq("status", filterStatus);
    }

    const { data, error } = await query;
    if (error) {
      toast({ variant: "destructive", title: "Fehler beim Laden", description: error.message });
    }
    if (data) setReports(data as any);
    setLoading(false);
  }, [filterType, filterStatus, projectFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <PageHeader title="Tagesberichte" backPath={projectFilter ? `/projects/${projectFilter}` : undefined} />

      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Typen</SelectItem>
              <SelectItem value="tagesbericht">Tagesbericht</SelectItem>
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
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Neuer Bericht
        </Button>
      </div>

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
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/daily-reports/${report.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {format(new Date(report.datum), "EEEE, dd.MM.yyyy", { locale: de })}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {report.report_type === "tagesbericht" ? "Tagesbericht" : "Zwischenbericht"}
                      </Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[report.status] || ""}`}>
                        {report.status === "offen" ? "Offen" : report.status === "gesendet" ? "Gesendet" : "Abgeschlossen"}
                      </Badge>
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
    </div>
  );
}
