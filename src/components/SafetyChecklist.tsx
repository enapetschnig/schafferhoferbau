import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Check, X } from "lucide-react";
import { VoiceAIInput } from "@/components/VoiceAIInput";

export interface SafetyItem {
  id: string;
  label: string;
  /** @deprecated: legacy binary checkbox */
  checked?: boolean;
  /** Neuer Status: "ok" = gruen, "nok" = rot, null = nicht bewertet */
  status?: "ok" | "nok" | null;
}

export const DEFAULT_SAFETY_ITEMS: SafetyItem[] = [
  { id: "psa", label: "PSA (Persönliche Schutzausrüstung) vorhanden", checked: false, status: null },
  { id: "erste_hilfe", label: "Erste-Hilfe-Kasten vorhanden und zugänglich", checked: false, status: null },
  { id: "absturz", label: "Absturzsicherungen kontrolliert", checked: false, status: null },
  { id: "brandschutz", label: "Brandschutz gewährleistet", checked: false, status: null },
  { id: "fluchtwege", label: "Zugangs- und Fluchtwege frei", checked: false, status: null },
  { id: "maschinen", label: "Maschinen und Geräte geprüft", checked: false, status: null },
  { id: "absicherung", label: "Baustelle abgesichert", checked: false, status: null },
];

interface SafetyChecklistProps {
  items: SafetyItem[];
  onChange: (items: SafetyItem[]) => void;
  notiz?: string;
  onNotizChange?: (v: string) => void;
  disabled?: boolean;
}

// Migrations-Helper: altes Format (checked) auf neues (status) uebersetzen
const normalizeItem = (item: SafetyItem): SafetyItem => {
  if (item.status != null) return item;
  if (item.checked === true) return { ...item, status: "ok" };
  return { ...item, status: null };
};

export function SafetyChecklist({ items, onChange, notiz = "", onNotizChange, disabled = false }: SafetyChecklistProps) {
  const normalized = items.map(normalizeItem);
  const allMarked = normalized.every((i) => i.status === "ok" || i.status === "nok");
  const allOk = normalized.every((i) => i.status === "ok");
  const anyNok = normalized.some((i) => i.status === "nok");

  const setStatus = (id: string, status: "ok" | "nok") => {
    onChange(
      normalized.map((item) =>
        item.id === id ? { ...item, status, checked: status === "ok" } : item
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <ShieldCheck className={`w-5 h-5 ${allOk ? "text-green-600" : anyNok ? "text-red-600" : "text-muted-foreground"}`} />
        <Label className="text-base font-semibold">Sicherheitscheckliste</Label>
        {allMarked && allOk && (
          <span className="text-xs text-green-600 font-medium">Vollständig kontrolliert</span>
        )}
        {allMarked && anyNok && (
          <span className="text-xs text-red-600 font-medium">Mängel vermerkt</span>
        )}
      </div>
      <div className="space-y-1.5">
        {normalized.map((item) => (
          <div key={item.id} className={`flex items-center gap-2 p-2 rounded-md border ${
            item.status === "ok" ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
            : item.status === "nok" ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
            : "bg-muted/30"
          }`}>
            <span className={`flex-1 text-sm ${item.status === "ok" ? "text-green-900 dark:text-green-100" : item.status === "nok" ? "text-red-900 dark:text-red-100" : "text-muted-foreground"}`}>
              {item.label}
            </span>
            <Button
              type="button"
              size="sm"
              variant={item.status === "ok" ? "default" : "outline"}
              className={`h-7 px-2 ${item.status === "ok" ? "bg-green-600 hover:bg-green-700" : ""}`}
              onClick={() => setStatus(item.id, "ok")}
              disabled={disabled}
              title="Kontrolliert / OK"
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={item.status === "nok" ? "destructive" : "outline"}
              className="h-7 px-2"
              onClick={() => setStatus(item.id, "nok")}
              disabled={disabled}
              title="Nicht kontrolliert / Mangel"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {!allMarked && (
        <p className="text-xs text-destructive">
          Alle Punkte müssen grün (OK) oder rot (Mangel) markiert sein.
        </p>
      )}

      {onNotizChange && (
        <div className="pt-2 space-y-1">
          <Label className="text-xs text-muted-foreground">Anmerkungen zur Checkliste</Label>
          <VoiceAIInput
            multiline
            rows={2}
            context="anmerkung"
            value={notiz}
            onChange={onNotizChange}
            placeholder="Optional: Details zu Mängeln oder allgemeine Anmerkungen"
          />
        </div>
      )}
    </div>
  );
}
