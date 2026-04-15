import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Position = {
  id: string;
  position_nr: string | null;
  beschreibung: string;
  geplante_stunden: number;
  ist_stunden: number;
  notizen: string | null;
};

interface Props {
  projectId: string;
}

export function Nachkalkulation({ projectId }: Props) {
  const { toast } = useToast();
  const [positionen, setPositionen] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchPositionen(); }, [projectId]);

  const fetchPositionen = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("nachkalkulation_positionen")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order");
    if (data) setPositionen(data as Position[]);
    setLoading(false);
  };

  const handleAdd = async () => {
    const { data } = await supabase.from("nachkalkulation_positionen").insert({
      project_id: projectId,
      beschreibung: "",
      geplante_stunden: 0,
      ist_stunden: 0,
      sort_order: positionen.length,
    }).select().single();
    if (data) setPositionen(prev => [...prev, data as Position]);
  };

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const handleUpdate = (id: string, field: string, value: any) => {
    setPositionen(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    const key = `${id}_${field}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      await supabase.from("nachkalkulation_positionen").update({ [field]: value }).eq("id", id);
      delete debounceTimers.current[key];
    }, 500);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("nachkalkulation_positionen").delete().eq("id", id);
    setPositionen(prev => prev.filter(p => p.id !== id));
  };

  const handleExcelExport = () => {
    const data = positionen.map(p => ({
      "Pos. Nr.": p.position_nr || "",
      Beschreibung: p.beschreibung,
      "Geplante Std.": p.geplante_stunden,
      "Ist Std.": p.ist_stunden,
      Differenz: (p.ist_stunden - p.geplante_stunden).toFixed(1),
      Notizen: p.notizen || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 10 }, { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nachkalkulation");
    XLSX.writeFile(wb, `Nachkalkulation_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

    // Bestehende loeschen und neu importieren
    await supabase.from("nachkalkulation_positionen").delete().eq("project_id", projectId);

    let imported = 0;
    for (const row of rows) {
      const beschreibung = (row["Beschreibung"] || row["beschreibung"] || "").toString().trim();
      if (!beschreibung) continue;
      await supabase.from("nachkalkulation_positionen").insert({
        project_id: projectId,
        position_nr: (row["Pos. Nr."] || row["position_nr"] || "").toString() || null,
        beschreibung,
        geplante_stunden: parseFloat(row["Geplante Std."] || row["geplante_stunden"] || "0") || 0,
        ist_stunden: parseFloat(row["Ist Std."] || row["ist_stunden"] || "0") || 0,
        notizen: (row["Notizen"] || row["notizen"] || "").toString() || null,
        sort_order: imported,
      });
      imported++;
    }
    toast({ title: `${imported} Positionen importiert` });
    fetchPositionen();
    e.target.value = "";
  };

  const totalGeplant = positionen.reduce((s, p) => s + (p.geplante_stunden || 0), 0);
  const totalIst = positionen.reduce((s, p) => s + (p.ist_stunden || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Nachkalkulation</CardTitle>
          <div className="flex gap-1">
            {positionen.length > 0 && (
              <Button size="sm" variant="ghost" onClick={handleExcelExport}><Download className="h-4 w-4" /></Button>
            )}
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
              <Button size="sm" variant="ghost" type="button" onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                <Upload className="h-4 w-4" />
              </Button>
            </label>
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-1" /> Position
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Lade...</p> : positionen.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Noch keine Positionen. Excel importieren oder manuell hinzufuegen.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Pos.</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead className="w-24 text-right">Geplant</TableHead>
                  <TableHead className="w-24 text-right">Ist</TableHead>
                  <TableHead className="w-24 text-right">Diff.</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positionen.map(p => {
                  const diff = (p.ist_stunden || 0) - (p.geplante_stunden || 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Input className="h-8 w-14 text-xs" value={p.position_nr || ""} onChange={e => handleUpdate(p.id, "position_nr", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-xs" value={p.beschreibung} onChange={e => handleUpdate(p.id, "beschreibung", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 w-20 text-xs text-right" type="number" step="0.5" value={p.geplante_stunden} onChange={e => handleUpdate(p.id, "geplante_stunden", parseFloat(e.target.value) || 0)} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 w-20 text-xs text-right" type="number" step="0.5" value={p.ist_stunden} onChange={e => handleUpdate(p.id, "ist_stunden", parseFloat(e.target.value) || 0)} />
                      </TableCell>
                      <TableCell className={`text-right text-xs font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""}`}>
                        {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="text-right font-semibold text-xs">Summe:</TableCell>
                  <TableCell className="text-right font-bold text-xs">{totalGeplant.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-bold text-xs">{totalIst.toFixed(1)}</TableCell>
                  <TableCell className={`text-right font-bold text-xs ${totalIst - totalGeplant > 0 ? "text-red-600" : "text-green-600"}`}>
                    {totalIst - totalGeplant > 0 ? "+" : ""}{(totalIst - totalGeplant).toFixed(1)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
