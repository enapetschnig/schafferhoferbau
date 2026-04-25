import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, FileSignature } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MonthlySignoffProps {
  year: number;
  month: number;
  totalHours: number;
  lohnstunden: number;
  zaStunden: number;
}

export function MonthlySignoff({ year, month, totalHours, lohnstunden, zaStunden }: MonthlySignoffProps) {
  const { toast } = useToast();
  const [signoff, setSignoff] = useState<{
    id: string;
    signed_at: string;
    invalidated_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthNames = [
    "Jänner", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  useEffect(() => {
    fetchSignoff();
  }, [year, month]);

  const fetchSignoff = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("monthly_signoffs")
      .select("id, signed_at, invalidated_at")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    setSignoff(data);
    setLoading(false);
  };

  const handleSign = async () => {
    if (!signature) {
      toast({ variant: "destructive", title: "Unterschrift erforderlich" });
      return;
    }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { error } = await supabase.from("monthly_signoffs").upsert({
      user_id: user.id,
      year,
      month,
      signature_data: signature,
      signed_at: new Date().toISOString(),
      invalidated_at: null,
      invalidated_reason: null,
    }, { onConflict: "user_id,year,month" });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Monatsabschluss bestätigt" });
      setShowDialog(false);
      fetchSignoff();
    }
    setSaving(false);
  };

  // Only show if viewing a past month (from 1st of following month)
  const now = new Date();
  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
  if (isCurrentOrFuture || loading) return null;

  const isSigned = signoff && !signoff.invalidated_at;
  const isInvalidated = signoff && signoff.invalidated_at;

  return (
    <>
      {/* Status Badge */}
      <div className="flex items-center gap-2">
        {isSigned ? (
          <Badge variant="default" className="bg-green-600 cursor-pointer" onClick={() => setShowDialog(true)}>
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Bestätigt am {new Date(signoff!.signed_at).toLocaleDateString("de-AT")}
          </Badge>
        ) : isInvalidated ? (
          <Button variant="destructive" size="sm" onClick={() => setShowDialog(true)}>
            <AlertTriangle className="h-4 w-4 mr-1" />
            Erneut bestätigen (Admin-Änderung)
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
            <FileSignature className="h-4 w-4 mr-1" />
            Monat abschließen
          </Button>
        )}
      </div>

      {/* Sign Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Monatsabschluss {monthNames[month - 1]} {year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm p-3 bg-muted/50 rounded-lg">
              <div>
                <span className="text-muted-foreground">Gesamtstunden:</span>
                <span className="font-bold ml-2">{totalHours.toFixed(1)} h</span>
              </div>
              <div>
                <span className="text-muted-foreground">Lohnstunden:</span>
                <span className="font-bold ml-2">{lohnstunden.toFixed(1)} h</span>
              </div>
              <div>
                <span className="text-muted-foreground">ZA-Stunden:</span>
                <span className="font-bold ml-2">{zaStunden.toFixed(1)} h</span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Ich bestätige, dass die oben aufgeführten Stunden korrekt sind.
            </p>

            <div>
              <p className="text-sm font-medium mb-2">Unterschrift:</p>
              <div className="border rounded-lg overflow-hidden">
                <SignaturePad onSignatureChange={setSignature} width={360} height={150} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Abbrechen</Button>
              <Button onClick={handleSign} disabled={saving || !signature}>
                {saving ? "Wird gespeichert..." : "Bestätigen & Unterschreiben"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
