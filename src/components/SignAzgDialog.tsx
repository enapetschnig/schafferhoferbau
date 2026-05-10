import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/SignaturePad";
import { Loader2, Download } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Anzeige im Dialog-Header. */
  employeeName: string;
  month: string;
  year: number;
  /**
   * Wird aufgerufen wenn der Nutzer "PDF erstellen" druckt. Beide Unterschriften
   * koennen leer sein — dann wird das PDF mit leeren Unterschriftslinien erzeugt.
   */
  onGenerate: (signatureEmployee: string | null, signatureEmployer: string | null) => Promise<void>;
}

// Dialog zum digitalen Unterschreiben der Arbeitszeitaufzeichnung am Handy
// (Mitarbeiter + Arbeitgeber). Erzeugt anschliessend das PDF — entweder mit
// eingebetteten Unterschriften oder mit leeren Linien fuer haendisches
// Unterschreiben.
export function SignAzgDialog({ open, onOpenChange, employeeName, month, year, onGenerate }: Props) {
  const [sigEmployee, setSigEmployee] = useState<string | null>(null);
  const [sigEmployer, setSigEmployer] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Bei jedem oeffnen Pad zuruecksetzen
  useEffect(() => {
    if (open) {
      setSigEmployee(null);
      setSigEmployer(null);
      setGenerating(false);
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!generating) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Arbeitszeitaufzeichnung unterschreiben</DialogTitle>
          <DialogDescription>
            {employeeName} — {month} {year}. Beide Unterschriften können direkt am Handy gesetzt werden, das PDF wird mit den Bildern eingebettet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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
              {employeeName} unterschreibt hier — Zeichnen mit dem Finger oder Stift.
            </p>
          </div>

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
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={generating}
            className="sm:flex-1"
          >
            <Download className="w-4 h-4 mr-1" />
            PDF ohne Unterschriften
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            disabled={generating || (!sigEmployee && !sigEmployer)}
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
