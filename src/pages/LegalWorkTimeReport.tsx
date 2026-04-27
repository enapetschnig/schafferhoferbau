import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Download } from "lucide-react";
import { format, getDaysInMonth } from "date-fns";
import { de } from "date-fns/locale";
import * as XLSX from "xlsx-js-style";
import { generateLegalWorkTimePDF } from "@/lib/generateLegalWorkTimePDF";

type Profile = { id: string; vorname: string; nachname: string };

type DayRow = {
  datum: string;
  beginn: string | null;
  ende: string | null;
  pauseMinutes: number;
  arbeitszeit: number;
  anmerkung: string | null; // SW = Schlechtwetter, U = Urlaub, K = Krank
  schlechtwetterStunden: number;
};

const monthNames = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

interface LegalWorkTimeReportProps {
  embedded?: boolean;
}

export default function LegalWorkTimeReport({ embedded = false }: LegalWorkTimeReportProps) {
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState("");
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch employees (exclude external)
  useEffect(() => {
    const fetchEmployees = async () => {
      // Get external user IDs to exclude
      const { data: externals } = await supabase
        .from("employees")
        .select("user_id")
        .eq("is_external", true);
      const externalIds = (externals || []).map(e => e.user_id).filter(Boolean);

      const { data } = await supabase
        .from("profiles")
        .select("id, vorname, nachname")
        .eq("is_active", true)
        .order("nachname");

      if (data) {
        setEmployees(data.filter(e => !externalIds.includes(e.id)));
      }
    };
    fetchEmployees();
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedUserId) {
      setRows([]);
      return;
    }
    setLoading(true);

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const daysInMonth = getDaysInMonth(new Date(year, month - 1));
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    // Fetch time entries and bad weather records in parallel
    const [{ data }, { data: weatherData }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("datum, start_time, end_time, pause_minutes, stunden, taetigkeit")
        .eq("user_id", selectedUserId)
        .gte("datum", startDate)
        .lte("datum", endDate)
        .order("datum")
        .order("start_time"),
      supabase
        .from("bad_weather_records")
        .select("datum, schlechtwetter_stunden")
        .eq("user_id", selectedUserId)
        .gte("datum", startDate)
        .lte("datum", endDate),
    ]);

    // Group time entries by datum
    const grouped: Record<string, { starts: string[]; ends: string[]; pause: number; stunden: number; taetigkeit: string[] }> = {};
    if (data) {
      for (const entry of data) {
        if (!grouped[entry.datum]) {
          grouped[entry.datum] = { starts: [], ends: [], pause: 0, stunden: 0, taetigkeit: [] };
        }
        if (entry.start_time) grouped[entry.datum].starts.push(entry.start_time);
        if (entry.end_time) grouped[entry.datum].ends.push(entry.end_time);
        grouped[entry.datum].pause += entry.pause_minutes || 0;
        grouped[entry.datum].stunden += entry.stunden || 0;
        if (entry.taetigkeit) grouped[entry.datum].taetigkeit.push(entry.taetigkeit);
      }
    }

    // Group bad weather by datum
    const weatherByDate: Record<string, number> = {};
    if (weatherData) {
      for (const w of weatherData) {
        weatherByDate[w.datum] = (weatherByDate[w.datum] || 0) + (w.schlechtwetter_stunden || 0);
      }
    }

    // Build rows for each day
    const dayRows: DayRow[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const datum = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const g = grouped[datum];
      const swHours = weatherByDate[datum] || 0;

      // Determine annotation
      let anmerkung: string | null = null;
      if (swHours > 0) anmerkung = "SW";
      if (g?.taetigkeit.includes("Urlaub")) anmerkung = "U";
      if (g?.taetigkeit.includes("Krankenstand")) anmerkung = "K";
      if (g?.taetigkeit.includes("Feiertag")) anmerkung = "F";
      if (g?.taetigkeit.includes("Zeitausgleich")) anmerkung = "ZA";

      if (g) {
        const beginn = g.starts.length > 0 ? g.starts.sort()[0]?.slice(0, 5) : null;
        const ende = g.ends.length > 0 ? g.ends.sort().reverse()[0]?.slice(0, 5) : null;
        dayRows.push({
          datum, beginn, ende,
          pauseMinutes: g.pause,
          arbeitszeit: Math.round(g.stunden * 100) / 100,
          anmerkung,
          schlechtwetterStunden: swHours,
        });
      } else {
        dayRows.push({
          datum, beginn: null, ende: null,
          pauseMinutes: 0, arbeitszeit: 0,
          anmerkung: swHours > 0 ? "SW" : null,
          schlechtwetterStunden: swHours,
        });
      }
    }

    setRows(dayRows);
    setLoading(false);
  }, [selectedUserId, month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalHours = rows.reduce((sum, r) => sum + r.arbeitszeit, 0);
  const totalPause = rows.reduce((sum, r) => sum + r.pauseMinutes, 0);
  const workingDays = rows.filter((r) => r.arbeitszeit > 0).length;
  const totalBadWeatherHours = rows.reduce((sum, r) => sum + r.schlechtwetterStunden, 0);

  const selectedEmployee = employees.find((e) => e.id === selectedUserId);
  const employeeName = selectedEmployee ? `${selectedEmployee.vorname} ${selectedEmployee.nachname}` : "";

  const formatPause = (minutes: number) => {
    if (minutes === 0) return "–";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  const handleExportExcel = () => {
    if (!selectedUserId || rows.length === 0) return;

    const wsData: string[][] = [
      ["Arbeitszeitaufzeichnung"],
      [`Mitarbeiter: ${employeeName}`],
      [`Zeitraum: ${monthNames[month - 1]} ${year}`],
      [],
      ["Datum", "Wochentag", "Arbeitsbeginn", "Arbeitsende", "Pause", "Arbeitszeit (h)", "Anmerkung"],
    ];

    for (const row of rows) {
      const dayName = format(new Date(row.datum), "EEEE", { locale: de });
      const anmerkungText = row.anmerkung
        ? row.anmerkung === "SW" ? `SW (${row.schlechtwetterStunden.toFixed(1)}h)` : row.anmerkung
        : "";
      wsData.push([
        format(new Date(row.datum), "dd.MM.yyyy"),
        dayName,
        row.beginn || "",
        row.ende || "",
        row.pauseMinutes > 0 ? formatPause(row.pauseMinutes) : "",
        row.arbeitszeit > 0 ? row.arbeitszeit.toFixed(2) : "",
        anmerkungText,
      ]);
    }

    wsData.push([]);
    wsData.push(["", "", "", "Summe:", formatPause(totalPause), totalHours.toFixed(2), ""]);
    wsData.push(["", "", "", "Arbeitstage:", "", workingDays.toString(), ""]);
    if (totalBadWeatherHours > 0) {
      wsData.push(["", "", "", "Schlechtwetter:", "", totalBadWeatherHours.toFixed(1), ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws["!cols"] = [
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
    ];

    // Bold header row
    for (let c = 0; c < 7; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 4, c })];
      if (cell) cell.s = { font: { bold: true } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arbeitszeitaufzeichnung");
    XLSX.writeFile(wb, `Arbeitszeitaufzeichnung_${employeeName.replace(/\s/g, "_")}_${monthNames[month - 1]}_${year}.xlsx`);
  };

  const handleExportPDF = async () => {
    if (!selectedUserId || rows.length === 0) return;
    await generateLegalWorkTimePDF({
      employeeName,
      month: monthNames[month - 1],
      year,
      rows,
      totalHours,
      totalPause,
      workingDays,
      totalBadWeatherHours,
    });
  };

  const content = (
    <>
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger><SelectValue placeholder="Mitarbeiter wählen" /></SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.vorname} {e.nachname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthNames.map((name, i) => (
              <SelectItem key={i} value={(i + 1).toString()}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map((y) => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedUserId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bitte einen Mitarbeiter auswählen
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-center text-muted-foreground py-8">Lade...</p>
      ) : (
        <>
          {/* Summary */}
          <div className={`grid gap-3 mb-4 ${totalBadWeatherHours > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Arbeitstage</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold">{workingDays}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Gesamtstunden</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Gesamtpause</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-2xl font-bold">{formatPause(totalPause)}</p>
              </CardContent>
            </Card>
            {totalBadWeatherHours > 0 && (
              <Card className="border-blue-200 dark:border-blue-800">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-sm font-medium text-blue-600 dark:text-blue-400">Schlechtwetter</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalBadWeatherHours.toFixed(1)}h</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <Download className="w-4 h-4 mr-1" /> PDF
            </Button>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead>Beginn</TableHead>
                      <TableHead>Ende</TableHead>
                      <TableHead>Pause</TableHead>
                      <TableHead className="text-right">Arbeitszeit</TableHead>
                      <TableHead className="text-center">Anmerkung</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const date = new Date(row.datum);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      return (
                        <TableRow
                          key={row.datum}
                          className={isWeekend ? "bg-muted/50" : row.arbeitszeit === 0 && !row.anmerkung ? "text-muted-foreground" : ""}
                        >
                          <TableCell className="text-sm">{format(date, "dd.MM.")}</TableCell>
                          <TableCell className="text-sm">{format(date, "EEE", { locale: de })}</TableCell>
                          <TableCell className="text-sm">{row.beginn || "–"}</TableCell>
                          <TableCell className="text-sm">{row.ende || "–"}</TableCell>
                          <TableCell className="text-sm">{row.pauseMinutes > 0 ? formatPause(row.pauseMinutes) : "–"}</TableCell>
                          <TableCell className="text-sm text-right font-medium">
                            {row.arbeitszeit > 0 ? `${row.arbeitszeit.toFixed(2)}h` : "–"}
                          </TableCell>
                          <TableCell className="text-sm text-center">
                            {row.anmerkung === "SW" ? (
                              <span className="text-blue-600 dark:text-blue-400 font-medium" title={`Schlechtwetter: ${row.schlechtwetterStunden.toFixed(1)}h`}>
                                SW ({row.schlechtwetterStunden.toFixed(1)}h)
                              </span>
                            ) : row.anmerkung === "U" ? (
                              <span className="text-green-600 font-medium">U</span>
                            ) : row.anmerkung === "K" ? (
                              <span className="text-red-600 font-medium">K</span>
                            ) : row.anmerkung === "F" ? (
                              <span className="text-purple-600 font-medium">F</span>
                            ) : row.anmerkung === "ZA" ? (
                              <span className="text-orange-600 font-medium">ZA</span>
                            ) : "–"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-bold">Summe</TableCell>
                      <TableCell className="font-bold">{formatPause(totalPause)}</TableCell>
                      <TableCell className="text-right font-bold">{totalHours.toFixed(2)}h</TableCell>
                      <TableCell className="text-center font-bold">
                        {totalBadWeatherHours > 0 ? `SW: ${totalBadWeatherHours.toFixed(1)}h` : ""}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <PageHeader title="Gesetzl. Arbeitszeitaufzeichnung" />
      <p className="text-sm text-muted-foreground mb-6">
        Arbeitszeitaufzeichnung gemäß § 26 AZG — reine Arbeitszeiten ohne Projekt- oder Tätigkeitszuordnung
      </p>
      {content}
    </div>
  );
}
