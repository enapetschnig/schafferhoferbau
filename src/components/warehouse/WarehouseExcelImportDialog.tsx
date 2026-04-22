import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Check, X, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx-js-style";
import { CATEGORY_LABELS, CATEGORY_OPTIONS, type WarehouseProductCategory } from "@/types/warehouse";

const CATEGORY_MAP: Record<string, WarehouseProductCategory> = {
  "kanäle": "kanaele", "kanal": "kanaele", "kanaele": "kanaele",
  "betonzubehör": "betonzubehoer", "beton": "betonzubehoer", "betonzubehoer": "betonzubehoer",
  "dämmung": "daemmung", "daemmung": "daemmung", "isolation": "daemmung",
  "kleinteile": "kleinteile", "klein": "kleinteile",
  "baugeräte": "baugeraete", "geräte": "baugeraete", "baugeraete": "baugeraete",
  "schalungen": "schalungen", "schalung": "schalungen",
};

type ImportRow = {
  name: string;
  category: WarehouseProductCategory | null;
  einheit: string;
  ek_preis: number | null;
  lieferant: string;            // Pflicht laut Spec
  aufschlag_prozent: number | null;
  rechnungsdatum: string | null; // YYYY-MM-DD
  lieferdatum: string | null;
  valid: boolean;
  error?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function WarehouseExcelImportDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const parseCategory = (val: string): WarehouseProductCategory | null => {
    if (!val) return null;
    const lower = val.toLowerCase().trim();
    if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
    for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(key)) return cat;
    }
    return null;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    // Excel-Datum (serial) oder String zu YYYY-MM-DD
    const toIso = (v: unknown): string | null => {
      if (v == null || v === "") return null;
      if (typeof v === "number") {
        // Excel-Serial: 1900-01-01 = 1, mit bekanntem 1900-Bug
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      }
      const s = String(v).trim();
      const dm = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
      if (dm) {
        const day = dm[1].padStart(2, "0");
        const mon = dm[2].padStart(2, "0");
        let yr = dm[3]; if (yr.length === 2) yr = "20" + yr;
        return `${yr}-${mon}-${day}`;
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    };

    const parsed: ImportRow[] = json.map((row) => {
      const nameVal = (row["Name"] || row["Bezeichnung"] || row["Artikel"] || row["Produkt"] || row["D"] || "") as string;
      const catVal = (row["Kategorie"] || row["Category"] || row["A"] || "") as string;
      const einheitVal = (row["Einheit"] || row["Unit"] || row["C"] || "Stück") as string;
      const preisVal = row["EK-Preis"] || row["Preis"] || row["Einkaufspreis"] || row["EK Preis"] || row["EK"] || row["E"] || null;
      const lieferantVal = (row["Lieferant"] || row["Supplier"] || row["I"] || "") as string;
      const aufschlagVal = row["Aufschlag"] || row["Aufschlag (%)"] || row["Aufschlag%"] || row["F"] || null;
      const rechnungsdatumVal = row["Rechnungsdatum"] || row["Rechnungs-Datum"] || row["G"] || null;
      const lieferdatumVal = row["Lieferdatum"] || row["Liefer-Datum"] || row["H"] || null;

      const category = parseCategory(String(catVal));
      const name = String(nameVal).trim();
      const lieferant = String(lieferantVal).trim();
      let ek_preis: number | null = null;
      if (preisVal != null) {
        const p = parseFloat(String(preisVal).replace(",", "."));
        if (!isNaN(p)) ek_preis = p;
      }
      let aufschlag_prozent: number | null = null;
      if (aufschlagVal != null) {
        const a = parseFloat(String(aufschlagVal).replace(",", "."));
        if (!isNaN(a)) aufschlag_prozent = a;
      }

      const valid = !!name && !!category && !!lieferant;
      return {
        name,
        category,
        einheit: String(einheitVal).trim() || "Stück",
        ek_preis,
        lieferant,
        aufschlag_prozent,
        rechnungsdatum: toIso(rechnungsdatumVal),
        lieferdatum: toIso(lieferdatumVal),
        valid,
        error: !name
          ? "Name fehlt"
          : !category
          ? "Ungültige Kategorie"
          : !lieferant
          ? "Lieferant fehlt (Pflichtfeld)"
          : undefined,
      };
    });

    setRows(parsed);
  };

  const updateRowCategory = (index: number, cat: WarehouseProductCategory) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              category: cat,
              valid: !!r.name && !!cat && !!r.lieferant,
              error: !r.lieferant ? "Lieferant fehlt (Pflichtfeld)" : undefined,
            }
          : r
      )
    );
  };

  const updateRowLieferant = (index: number, lieferant: string) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              lieferant: lieferant.trim(),
              valid: !!r.name && !!r.category && !!lieferant.trim(),
              error: !lieferant.trim() ? "Lieferant fehlt (Pflichtfeld)" : undefined,
            }
          : r
      )
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.valid && r.category);
    if (validRows.length === 0) {
      toast({ variant: "destructive", title: "Keine gültigen Zeilen zum Importieren" });
      return;
    }

    setImporting(true);
    try {
      const insertData = validRows.map((r) => ({
        name: r.name,
        category: r.category!,
        einheit: r.einheit,
        ek_preis: r.ek_preis,
        lieferant: r.lieferant,
        aufschlag_prozent: r.aufschlag_prozent,
        rechnungsdatum: r.rechnungsdatum,
        lieferdatum: r.lieferdatum,
      }));

      const { error } = await (supabase.from("warehouse_products") as any).insert(insertData);
      if (error) throw error;

      toast({ title: `${validRows.length} Produkte importiert` });
      onImported();
      onOpenChange(false);
      setRows([]);
      setFileName("");
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "Import-Fehler", description: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter((r) => r.valid).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRows([]); setFileName(""); } }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Excel Import</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Lade eine Excel-Datei hoch. Erwartete Spalten (Reihenfolge A-K wie in der Spec):<br />
              <strong>Kategorie</strong>*, Menge, Einheit, <strong>Name/Artikel</strong>*, EK-Preis, Aufschlag %,
              Rechnungsdatum, Lieferdatum, <strong>Lieferant</strong>*
              <span className="block text-xs mt-1">* = Pflichtfeld</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Gültige Kategorien: {Object.values(CATEGORY_LABELS).join(", ")}
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Excel-Datei auswählen</p>
              <p className="text-xs text-muted-foreground">.xlsx oder .xls</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {fileName} — {validCount}/{rows.length} gültig
              </p>
              <Button variant="outline" size="sm" onClick={() => { setRows([]); setFileName(""); }}>
                Andere Datei
              </Button>
            </div>

            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Einheit</TableHead>
                    <TableHead>EK-Preis</TableHead>
                    <TableHead>Lieferant *</TableHead>
                    <TableHead>Aufschlag %</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className={!row.valid ? "bg-red-50" : ""}>
                      <TableCell>
                        {row.valid ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{row.name || <span className="text-red-500 italic">fehlt</span>}</TableCell>
                      <TableCell>
                        {row.category ? (
                          <Badge variant="outline">{CATEGORY_LABELS[row.category]}</Badge>
                        ) : (
                          <Select onValueChange={(v) => updateRowCategory(i, v as WarehouseProductCategory)}>
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue placeholder="Wählen..." />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORY_OPTIONS.map((cat) => (
                                <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>{row.einheit}</TableCell>
                      <TableCell>{row.ek_preis != null ? `€ ${row.ek_preis.toFixed(2)}` : "–"}</TableCell>
                      <TableCell>
                        {row.lieferant ? (
                          row.lieferant
                        ) : (
                          <input
                            type="text"
                            placeholder="Lieferant *"
                            className="h-8 w-32 rounded border border-input bg-background px-2 text-xs"
                            onBlur={(e) => updateRowLieferant(i, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateRowLieferant(i, (e.target as HTMLInputElement).value);
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell>{row.aufschlag_prozent != null ? `${row.aufschlag_prozent}%` : "–"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeRow(i)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0}>
                {importing ? "Importiere..." : `${validCount} Produkte importieren`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
