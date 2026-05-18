import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/SignaturePad";
import { Loader2, Download, CheckCircle2, Send } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Anzeige im Dialog-Header. */
  employeeName: string;
  month: string;
  year: number;
  /**
   * Bereits in DB hinterlegte Mitarbeiter-Unterschrift (asynchron erfolgt).
   * Wenn gesetzt, wird das Mitarbeiter-Pad ausgeblendet und stattdessen die
   * bestehende Unterschrift als Bestaetigung gezeigt.
   */
  existingEmployeeSignedAt?: string | null;
  /** Bereits in DB hinterlegte Arbeitgeber-Unterschrift. */
  existingEmployerSignedAt?: string | null;
  /**
   * Optional: Trigger fuer "Mitarbeiter zur Unterschrift bitten" — legt einen
   * leeren Sig-Datensatz an. Erscheint nur wenn der Mitarbeiter noch nicht
   * unterschrieben hat.
   */
  onRequestEmployeeSignature?: () => Promise<void>;
  /**
   * Wird aufgerufen wenn der Nutzer "PDF erstellen" drueckt. sigEmployee ist
   * null wenn der Mitarbeiter schon in der DB unterschrieben hat (dort wird
   * die DB-Unterschrift genutzt). sigEmployer ist die im Dialog erfasste
   * Arbeitgeber-Unterschrift.
   */
  onGenerate: (signatureEmployee: string | null, signatureEmployer: string | null) => Promise<void>;
}

// Dialog zum digitalen Unterschreiben der Arbeitszeitaufzeichnung am Handy.
// Zwei Modi:
//  - Beide vor Ort: beide Unterschriften werden hier erfasst.
//  - Asynchron: Mitarbeiter hat schon in seiner App unterschrieben, Admin
//    sieht das oben als Bestaetigung und unterschreibt nur noch selbst.
export function SignAzgDialog({
  open, onOpenChange, employeeName, month, year,
  existingEmployeeSignedAt, existingEmployerSignedAt,
  onRequestEmployeeSignature, onGenerate,
}: Props) {
  const [sigEmployee, setSigEmployee] = useState<string | null>(null);
  const [sigEmployer, setSigEmployer] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (open) {
      setSigEmployee(null);
      setSigEmployer(null);
      setGenerating(false);
      setRequesting(false);
    }
  }, [open]);

  const handleSubmit = async (withSignatures: boolean) => {
    setGenerating(true);
    try {
      await onGenerate(
        withSignatures ? sigEmployee : null,
        withSignatures ? sigEmployer : null,
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleRequest = async () => {
    if (!onRequestEmployeeSignature) return;
    setRequesting(true);
    try {
      await onRequestEmployeeSignature();
    } finally {
      setRequesting(false);
    }
  };

  const employeeAlreadySigned = !!existingEmployeeSignedAt;
  // PDF erstellen ist immer moeglich (auch ohne neue Sigs) — User kann sich
  // den aktuellen Stand jederzeit als PDF holen.

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!generating) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Arbeitszeitaufzeichnung unterschreiben</DialogTitle>
          <DialogDescription>
            {employeeName} — {month} {year}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Mitarbeiter-Bereich: entweder Bestaetigung der DB-Sig oder Pad */}
          {employeeAlreadySigned ? (
            <div className="flex items-start gap-2 p-3 rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-900 dark:text-green-100">Mitarbeiter hat bereits unterschrieben</p>
                <p className="text-xs text-green-800 dark:text-green-200">
                  am {format(parseISO(existingEmployeeSignedAt!), "dd.MM.yyyy 'um' HH:mm", { locale: de })}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium mb-2">Unterschrift Mitarbeiter</p>
              <div className="border rounded-md bg-white">
                <SignaturePad
                  onSignatureChange={(d) => setSigEmployee(d)}
                  width={500}
                  height={140}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {employeeName} unterschreibt hier — oder kann unabhängig in der eigenen App unterschreiben.
              </p>
              {onRequestEmployeeSignature && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleRequest}
                  disabled={requesting}
                  className="h-auto p-0 mt-1 text-xs"
                >
                  {requesting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  Mitarbeiter zur Unterschrift bitten
                </Button>
              )}
            </div>
          )}

          {/* Arbeitgeber-Bereich */}
          {existingEmployerSignedAt ? (
            <div className="flex items-start gap-2 p-3 rounded-md border border-green-300 bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-900 dark:text-green-100">Arbeitgeber hat bereits unterschrieben</p>
                <p className="text-xs text-green-800 dark:text-green-200">
                  am {format(parseISO(existingEmployerSignedAt), "dd.MM.yyyy 'um' HH:mm", { locale: de })}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium mb-2">Unterschrift Arbeitgeber</p>
              <div className="border rounded-md bg-white">
                <SignaturePad
                  onSignatureChange={(d) => setSigEmployer(d)}
                  width={500}
                  height={140}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={generating}
            className="sm:flex-1"
          >
            <Download className="w-4 h-4 mr-1" />
            PDF ohne neue Unterschriften
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            disabled={generating || (!sigEmployee && !sigEmployer && !employeeAlreadySigned && !existingEmployerSignedAt)}
            className="sm:flex-1"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1" />
            )}
            PDF erstellen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
