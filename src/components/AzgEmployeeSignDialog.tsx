import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/SignaturePad";
import { Loader2, FileSignature, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildAzgSnapshot, submitEmployeeSignature, fetchAzgSignature, type AzgSnapshot } from "@/lib/azgSignatures";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  employeeName: string;
  monat: number;
  jahr: number;
  monthLabel: string;
  onSigned?: () => void;
}

// Mitarbeiter-Selbst-Unterschrift: Vorschau der Stunden + Unterschriftspad.
// Mit der ersten Unterschrift (Mitarbeiter ODER Arbeitgeber) wird der
// Snapshot in der DB eingefroren — die hier angezeigten Zahlen sind also
// rechtsverbindlich.
export function AzgEmployeeSignDialog({
  open, onOpenChange, userId, employeeName, monat, jahr, monthLabel, onSigned,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<AzgSnapshot | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSignature(null);
      try {
        // Wenn schon ein Datensatz existiert (z.B. Admin hat Anfrage gestartet,
        // ggf. schon mit Snapshot), bevorzugt diesen anzeigen.
        const existing = await fetchAzgSignature(userId, monat, jahr);
        if (cancelled) return;
        if (existing?.snapshot) {
          setSnapshot(existing.snapshot);
        } else {
          const snap = await buildAzgSnapshot(userId, monat, jahr, employeeName);
          if (cancelled) return;
          setSnapshot(snap);
        }
      } catch (err: any) {
        toast({ variant: "destructive", title: "Fehler beim Laden", description: err.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId, monat, jahr, employeeName, toast]);

  const handleSubmit = async () => {
    if (!signature) {
      toast({ variant: "destructive", title: "Unterschrift fehlt", description: "Bitte unterschreibe im Feld oben." });
      return;
    }
    setSubmitting(true);
    try {
      await submitEmployeeSignature(userId, monat, jahr, employeeName, signature);
      toast({ title: "Unterschrieben", description: `${monthLabel} ${jahr} wurde bestätigt.` });
      onSigned?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            Arbeitszeitaufzeichnung {monthLabel} {jahr}
          </DialogTitle>
          <DialogDescription>
            Bitte prüfe deine Stunden und bestätige mit deiner Unterschrift.
            Nach dem Unterschreiben werden die Werte fixiert und können von dir nicht mehr geändert werden.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !snapshot ? (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">Konnte die Stunden nicht laden.</p>
          </div>
        ) : (
          <>
            {/* Kompakte Stunden-Vorschau */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Übersicht (bis Schwellenwert)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Arbeitstage:</span>
                <span>{snapshot.workingDays}</span>
                <span className="text-muted-foreground">Normalarbeitszeit:</span>
                <span>{snapshot.totalNormalstunden.toFixed(2)} h</span>
                <span className="text-muted-foreground">Überstunden:</span>
                <span>{snapshot.totalUeberstundenLohn.toFixed(2)} h</span>
                <span className="text-muted-foreground font-semibold">Gesamtstunden:</span>
                <span className="font-semibold">{snapshot.totalLohnstunden.toFixed(2)} h</span>
                <span className="text-muted-foreground">Diäten &gt;3 h / &gt;9 h / &gt;100 km:</span>
                <span>{snapshot.dietKlein} / {snapshot.dietGross} / {snapshot.dietAnfahrt}</span>
                {snapshot.totalBadWeatherHours > 0 && (
                  <>
                    <span className="text-muted-foreground">Schlechtwetterstunden:</span>
                    <span>{snapshot.totalBadWeatherHours.toFixed(1)} h</span>
                  </>
                )}
                {snapshot.totalFeiertage > 0 && (
                  <>
                    <span className="text-muted-foreground">Feiertage:</span>
                    <span>{snapshot.totalFeiertage}</span>
                  </>
                )}
              </div>
            </div>

            {/* Tages-Liste — nur die Tage mit Stunden */}
            <div className="border rounded-md max-h-48 overflow-y-auto text-xs">
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Datum</th>
                    <th className="text-left px-2 py-1">Tag</th>
                    <th className="text-left px-2 py-1">Beginn</th>
                    <th className="text-left px-2 py-1">Ende</th>
                    <th className="text-right px-2 py-1">Std.</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.rows.filter((r) => r.lohnstunden > 0 || r.anmerkung).map((r) => (
                    <tr key={r.datum} className="border-t">
                      <td className="px-2 py-1">{format(new Date(r.datum), "dd.MM.")}</td>
                      <td className="px-2 py-1">{format(new Date(r.datum), "EEE", { locale: de })}</td>
                      <td className="px-2 py-1">{r.beginn || "–"}</td>
                      <td className="px-2 py-1">{r.beginn && r.lohnstunden > 0
                        ? cappedEnde(r.beginn, r.pauseMinutes, r.lohnstunden)
                        : (r.ende || "–")}</td>
                      <td className="px-2 py-1 text-right">{r.lohnstunden > 0 ? r.lohnstunden.toFixed(2) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unterschrift */}
            <div>
              <p className="text-sm font-medium mb-2">Deine Unterschrift</p>
              <div className="border rounded-md bg-white">
                <SignaturePad
                  onSignatureChange={(d) => setSignature(d)}
                  width={500}
                  height={140}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Mit deiner Unterschrift bestätigst du die oben angeführten Stunden.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={handleSubmit} disabled={!signature || submitting} className="flex-1">
                {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSignature className="w-4 h-4 mr-1" />}
                Bestätigen & unterschreiben
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Lokale Hilfe (gleiche Logik wie im PDF) — auf den Schwellenwert gekapptes Ende.
function cappedEnde(beginn: string, pauseMinutes: number, lohnstunden: number): string {
  const [h, m] = beginn.split(":").map(Number);
  const totalMin = h * 60 + m + pauseMinutes + Math.round(lohnstunden * 60);
  const eh = Math.floor(totalMin / 60) % 24;
  const em = totalMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}
