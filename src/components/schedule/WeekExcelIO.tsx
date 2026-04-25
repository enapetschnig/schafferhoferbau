import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2 } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { format, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Assignment, Profile, Project } from "./scheduleTypes";

interface Props {
  weekStart: Date;
  profiles: Profile[];
  projects: Project[];
  assignments: Assignment[];
  userId: string;
  onImported: () => void;
}

const DAY_HEADERS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Excel-Matrix fuer die sichtbare Kalenderwoche:
 * - Zeilen: Mitarbeiter
 * - Spalten: Mo-So mit "<Projektname>" oder "TRANSPORT:<Projektname>" beim Transport-Flag
 * Beim Import werden die Assignments der Woche ueberschrieben.
 */
export function WeekExcelIO({
  weekStart,
  profiles,
  projects,
  assignments,
  userId,
  onImported,
}: Props) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const handleExport = () => {
    const projectByName = Object.fromEntries(projects.map((p) => [p.name.toLowerCase(), p]));
    const weekLabel = `KW${format(weekStart, "II", { locale: de })}_${format(weekStart, "yyyy-MM-dd")}`;

    const rows = profiles.map((p) => {
      const row: Record<string, string> = {
        Mitarbeiter: `${p.vorname} ${p.nachname}`.trim(),
      };
      days.forEach((d, i) => {
        const datum = format(d, "yyyy-MM-dd");
        const dayAssignments = assignments.filter(
          (a) => a.user_id === p.id && a.datum === datum
        );
        const header = `${DAY_HEADERS[i]} ${format(d, "dd.MM.")}`;
        if (dayAssignments.length === 0) {
          row[header] = "";
        } else {
          row[header] = dayAssignments
            .map((a) => {
              const proj = projects.find((pp) => pp.id === a.project_id);
              if (!proj) return "";
              return a.transport_erforderlich ? `TRANSPORT:${proj.name}` : proj.name;
            })
            .filter(Boolean)
            .join(" | ");
        }
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // Spalten-Breiten
    ws["!cols"] = [{ wch: 30 }, ...days.map(() => ({ wch: 22 }))];
    // Header-Style
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) {
        ws[addr].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: "E2E8F0" } },
        };
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantafel");

    // Zweites Sheet: Projekte (Referenzliste)
    const projWs = XLSX.utils.json_to_sheet(
      projects.map((p) => ({ Projektname: p.name }))
    );
    projWs["!cols"] = [{ wch: 40 }];
    XLSX.utils.book_append_sheet(wb, projWs, "Projekte");

    XLSX.writeFile(wb, `Plantafel_${weekLabel}.xlsx`);
    toast({ title: "Excel heruntergeladen" });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets["Plantafel"] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Sheet 'Plantafel' nicht gefunden");
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const profileByName = new Map<string, Profile>();
      for (const p of profiles) {
        const key = `${p.vorname} ${p.nachname}`.trim().toLowerCase();
        profileByName.set(key, p);
      }
      const projectByName = new Map<string, Project>();
      for (const p of projects) projectByName.set(p.name.trim().toLowerCase(), p);

      type Upsert = {
        user_id: string;
        project_id: string;
        datum: string;
        created_by: string;
        notizen: string | null;
        transport_erforderlich: boolean;
      };
      const upserts: Upsert[] = [];
      const affectedUsers = new Set<string>();
      const skippedNames = new Set<string>();
      const skippedProjects = new Set<string>();

      for (const row of rows) {
        const rawName = String(row["Mitarbeiter"] || row["MA"] || "").trim();
        if (!rawName) continue;
        const prof = profileByName.get(rawName.toLowerCase());
        if (!prof) {
          skippedNames.add(rawName);
          continue;
        }
        affectedUsers.add(prof.id);
        days.forEach((d, i) => {
          const datum = format(d, "yyyy-MM-dd");
          const header = `${DAY_HEADERS[i]} ${format(d, "dd.MM.")}`;
          const val = String(row[header] ?? "").trim();
          if (!val) return;
          // Mehrere Projekte in einer Zelle via "|"
          const parts = val.split("|").map((s) => s.trim()).filter(Boolean);
          for (const part of parts) {
            const transport = /^transport:/i.test(part);
            const rawProjName = part.replace(/^transport:/i, "").trim();
            const proj = projectByName.get(rawProjName.toLowerCase());
            if (!proj) {
              skippedProjects.add(rawProjName);
              continue;
            }
            upserts.push({
              user_id: prof.id,
              project_id: proj.id,
              datum,
              created_by: userId,
              notizen: null,
              transport_erforderlich: transport,
            });
          }
        });
      }

      // Vorher: alle betroffenen (user, datum)-Kombinationen der Woche loeschen,
      // damit der Import den neuen Stand abbildet (nicht nur hinzufuegt)
      const from = format(days[0], "yyyy-MM-dd");
      const to = format(days[days.length - 1], "yyyy-MM-dd");
      if (affectedUsers.size > 0) {
        await supabase
          .from("worker_assignments")
          .delete()
          .in("user_id", Array.from(affectedUsers))
          .gte("datum", from)
          .lte("datum", to);
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("worker_assignments")
          .insert(upserts);
        if (error) throw error;
      }
      const skips: string[] = [];
      if (skippedNames.size > 0) {
        skips.push(`Unbekannte Mitarbeiter: ${[...skippedNames].slice(0, 5).join(", ")}${skippedNames.size > 5 ? "…" : ""}`);
      }
      if (skippedProjects.size > 0) {
        skips.push(`Unbekannte Projekte: ${[...skippedProjects].slice(0, 5).join(", ")}${skippedProjects.size > 5 ? "…" : ""}`);
      }
      if (skips.length > 0) {
        toast({
          variant: "destructive",
          title: `Import mit Warnungen (${upserts.length} übernommen)`,
          description: skips.join(" · "),
        });
      } else {
        toast({
          title: `Import abgeschlossen`,
          description: `${upserts.length} Zuordnungen für ${affectedUsers.size} Mitarbeiter übernommen`,
        });
      }
      onImported();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import fehlgeschlagen", description: err?.message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImport}
      />
      <Button variant="outline" size="sm" onClick={handleExport} title="Plantafel als Excel exportieren">
        <Download className="h-4 w-4 mr-1" /> Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        title="Aus Excel importieren (überschreibt Woche)"
      >
        {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
        Import
      </Button>
    </>
  );
}
