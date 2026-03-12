import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2, Plus } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type ChecklistItem = {
  id: string;
  category: string;
  question: string;
};

type EditableRow = {
  category: string;
  question: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (items: ChecklistItem[]) => void;
}

// Convert all cell values to plain strings to ensure JSON-serializability
function sanitizeRows(rows: Record<string, unknown>[]): Record<string, string>[] {
  return rows.map(row => {
    const clean: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      if (val !== null && val !== undefined) {
        clean[String(key)] = String(val).trim();
      }
    }
    return clean;
  }).filter(row => Object.values(row).some(v => v.length > 0));
}

export function SafetyExcelImportDialog({ open, onOpenChange, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName("");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    e.target.value = "";

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (json.length === 0) {
      toast({ variant: "destructive", title: "Leere Datei", description: "Die Excel-Datei enthält keine Daten." });
      return;
    }

    // Sanitize: convert all values to plain strings, limit to 200 rows
    const sanitized = sanitizeRows(json).slice(0, 200);

    setAiLoading(true);
    const { data, error } = await supabase.functions.invoke("parse-safety-checklist", {
      body: { rows: sanitized },
    });
    setAiLoading(false);

    if (error) {
      toast({ variant: "destructive", title: "KI-Analyse fehlgeschlagen", description: error.message });
      return;
    }

    if (data?.error) {
      toast({ variant: "destructive", title: "KI-Analyse fehlgeschlagen", description: data.error });
      return;
    }

    if (!data?.items || !Array.isArray(data.items)) {
      toast({ variant: "destructive", title: "KI-Analyse fehlgeschlagen", description: "Unerwartetes Antwortformat." });
      return;
    }

    const parsed: EditableRow[] = (data.items as { category: string; question: string }[])
      .filter((item) => item.question?.trim())
      .map((item) => ({
        category: item.category?.trim() || "",
        question: item.question.trim(),
      }));

    if (parsed.length === 0) {
      toast({ variant: "destructive", title: "Keine Prüfpunkte gefunden", description: "Die KI konnte keine Prüfpunkte erkennen." });
      return;
    }

    setRows(parsed);
  };

  const updateRow = (index: number, field: "category" | "question", value: string) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { category: "", question: "" }]);
  };

  const handleConfirm = () => {
    const validRows = rows.filter((r) => r.question.trim());
    if (validRows.length === 0) {
      toast({ variant: "destructive", title: "Keine gültigen Prüfpunkte" });
      return;
    }
    const items: ChecklistItem[] = validRows.map((r, i) => ({
      id: `item-${Date.now()}-${i}`,
      category: r.category || "Allgemein",
      question: r.question.trim(),
    }));
    onImport(items);
    onOpenChange(false);
    reset();
  };

  const validCount = rows.filter((r) => r.question.trim()).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Checkliste aus Excel importieren</DialogTitle>
        </DialogHeader>

        {aiLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">KI analysiert <strong>{fileName}</strong>…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Excel hochladen — die KI erkennt die Prüfpunkte automatisch, egal wie die Spalten heißen
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <strong>{fileName}</strong> — {validCount} Prüfpunkte
              </p>
              <Button variant="outline" size="sm" onClick={reset}>
                Andere Datei
              </Button>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.category}
                    onChange={(e) => updateRow(i, "category", e.target.value)}
                    placeholder="Kategorie"
                    className="w-32 text-xs shrink-0"
                  />
                  <Input
                    value={row.question}
                    onChange={(e) => updateRow(i, "question", e.target.value)}
                    placeholder="Prüfpunkt..."
                    className="flex-1 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => removeRow(i)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" /> Prüfpunkt hinzufügen
            </Button>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleConfirm} disabled={validCount === 0}>
                {validCount} Prüfpunkte übernehmen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
