import { useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { startOfISOWeek, setISOWeek, addDays, format, parseISO, getISOWeek, getISOWeekYear } from "date-fns";

// Helper: ISO-Wochennummer + Jahr -> Datum (Mo) und (So)
function weekToDateRange(year: number, week: number): { start: string; end: string } {
  const monStart = startOfISOWeek(setISOWeek(new Date(year, 5, 15), Math.max(1, Math.min(53, week))));
  const sunEnd = addDays(monStart, 6);
  return { start: format(monStart, "yyyy-MM-dd"), end: format(sunEnd, "yyyy-MM-dd") };
}

interface Project {
  id: string;
  name: string;
}

interface Resource {
  id: string;
  name: string;
  farbe?: string | null;
}

interface Props {
  year: number;
  projects: Project[];
  resources: Resource[];
  onImported: () => void;
}

/**
 * Excel Import/Export fuer Jahresplanung
 * Sheet 1: Projekt-Bloecke (yearly_plan_blocks)
 * Sheet 2: Ressourcen-Bloecke (yearly_resource_blocks)
 *
 * Import: ergaenzt bestehende Daten (kein Overwrite).
 */
export function YearPlanExcelIO({ year, projects, resources, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const [pbResp, rbResp] = await Promise.all([
        supabase.from("yearly_plan_blocks").select("*").eq("year", year).order("sort_order"),
        ((supabase as any).from("resource_blocks"))
          .select("id, resource_id, project_id, start_date, end_date, label, sort_order")
          .lte("start_date", yearEnd)
          .gte("end_date", yearStart)
          .order("sort_order"),
      ]);

      const projMap = new Map(projects.map(p => [p.id, p.name]));
      const resMap = new Map(resources.map(r => [r.id, r.name]));

      const planRows = (pbResp.data || []).map((b: any) => ({
        Titel: b.title,
        Partie: b.partie || "",
        "Individueller Name": b.individual_name || "",
        Projekt: b.project_id ? (projMap.get(b.project_id) || "") : "",
        "Von KW": b.start_week,
        "Bis KW": b.end_week,
        Farbe: b.color || "",
      }));

      const resRows = (rbResp.data || []).map((b: any) => {
        const sd = parseISO(b.start_date);
        const ed = parseISO(b.end_date);
        return {
          Ressource: resMap.get(b.resource_id) || "?",
          Projekt: b.project_id ? (projMap.get(b.project_id) || "") : "",
          "Von KW": getISOWeekYear(sd) === year ? getISOWeek(sd) : 1,
          "Bis KW": getISOWeekYear(ed) === year ? getISOWeek(ed) : 53,
          Label: b.label || "",
        };
      });

      const wb = XLSX.utils.book_new();
      const wsPlan = XLSX.utils.json_to_sheet(planRows.length > 0 ? planRows : [{
        Titel: "", Partie: "", "Individueller Name": "", Projekt: "",
        "Von KW": "", "Bis KW": "", Farbe: "",
      }]);
      wsPlan["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 25 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsPlan, "Projekt-Blöcke");

      const wsRes = XLSX.utils.json_to_sheet(resRows.length > 0 ? resRows : [{
        Ressource: "", Projekt: "", "Von KW": "", "Bis KW": "", Label: "",
      }]);
      wsRes["!cols"] = [{ wch: 25 }, { wch: 25 }, { wch: 8 }, { wch: 8 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsRes, "Ressourcen-Blöcke");

      XLSX.writeFile(wb, `Jahresplanung_${year}.xlsx`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export fehlgeschlagen", description: err.message });
    } finally {
      setExporting(false);
    }
  };

  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht eingeloggt");

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const projByName = new Map(projects.map(p => [p.name.toLowerCase().trim(), p.id]));
      const resByName = new Map(resources.map(r => [r.name.toLowerCase().trim(), r.id]));

      let plannedAdded = 0, resourceAdded = 0, skipped = 0;
      const errors: string[] = [];

      // Sheet: Projekt-Blöcke
      const planSheet = wb.Sheets["Projekt-Blöcke"] || wb.Sheets[wb.SheetNames[0]];
      if (planSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(planSheet);
        for (const row of rows) {
          const titel = (row["Titel"] || row["titel"] || "").toString().trim();
          if (!titel) { skipped++; continue; }
          const projName = (row["Projekt"] || row["projekt"] || "").toString().trim().toLowerCase();
          const projectId = projName ? projByName.get(projName) || null : null;
          const startWeek = parseInt(row["Von KW"] || row["start_week"] || row["Start KW"] || "1");
          const endWeek = parseInt(row["Bis KW"] || row["end_week"] || row["End KW"] || "1");
          if (isNaN(startWeek) || isNaN(endWeek) || startWeek < 1 || endWeek > 53 || startWeek > endWeek) {
            errors.push(`Projekt-Block "${titel}": Ungültige KW-Range (${startWeek}-${endWeek})`);
            skipped++;
            continue;
          }
          const { error } = await supabase.from("yearly_plan_blocks").insert({
            year,
            title: titel,
            partie: (row["Partie"] || row["partie"] || "").toString().trim() || null,
            individual_name: (row["Individueller Name"] || row["individual_name"] || "").toString().trim() || null,
            project_id: projectId,
            start_week: startWeek,
            end_week: endWeek,
            color: (row["Farbe"] || row["color"] || "#3B82F6").toString().trim(),
            created_by: user.id,
          });
          if (error) {
            errors.push(`"${titel}": ${error.message}`);
            skipped++;
          } else {
            plannedAdded++;
          }
        }
      }

      // Sheet: Ressourcen-Blöcke
      const resSheet = wb.Sheets["Ressourcen-Blöcke"];
      if (resSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(resSheet);
        for (const row of rows) {
          const resName = (row["Ressource"] || row["ressource"] || "").toString().trim().toLowerCase();
          if (!resName) { skipped++; continue; }
          const resourceId = resByName.get(resName);
          if (!resourceId) {
            errors.push(`Ressource "${resName}" nicht gefunden (erst in Ressourcen-Verwaltung anlegen)`);
            skipped++;
            continue;
          }
          const projName = (row["Projekt"] || row["projekt"] || "").toString().trim().toLowerCase();
          const projectId = projName ? projByName.get(projName) || null : null;
          const startWeek = parseInt(row["Von KW"] || row["start_week"] || "1");
          const endWeek = parseInt(row["Bis KW"] || row["end_week"] || "1");
          if (isNaN(startWeek) || isNaN(endWeek) || startWeek < 1 || endWeek > 53 || startWeek > endWeek) {
            errors.push(`Ressource "${resName}": Ungültige KW-Range`);
            skipped++;
            continue;
          }
          const sRange = weekToDateRange(year, startWeek);
          const eRange = weekToDateRange(year, endWeek);
          const { error } = await ((supabase as any).from("resource_blocks")).insert({
            resource_id: resourceId,
            project_id: projectId,
            start_date: sRange.start,
            end_date: eRange.end,
            label: (row["Label"] || row["label"] || "").toString().trim() || null,
            created_by: user.id,
          });
          if (error) {
            errors.push(`"${resName}": ${error.message}`);
            skipped++;
          } else {
            resourceAdded++;
          }
        }
      }

      if (errors.length > 0) {
        toast({
          variant: "destructive",
          title: `Import mit Problemen (${errors.length})`,
          description: errors.slice(0, 3).join(" · "),
        });
      }
      toast({
        title: "Import abgeschlossen",
        description: `${plannedAdded} Projekt-Blöcke, ${resourceAdded} Ressourcen-Blöcke. ${skipped > 0 ? `${skipped} übersprungen.` : ""}`,
      });
      onImported();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import fehlgeschlagen", description: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={exportExcel} disabled={exporting}>
        {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
        Excel Export
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={importExcel}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
      >
        {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
        Excel Import
      </Button>
    </>
  );
}
