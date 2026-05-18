import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSignature, ChevronRight } from "lucide-react";
import { fetchPendingSignaturesForEmployee } from "@/lib/azgSignatures";
import { AzgEmployeeSignDialog } from "@/components/AzgEmployeeSignDialog";

interface Props {
  userId: string;
  employeeName: string;
}

const MONTH_NAMES = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// Dashboard-Karte fuer offene Arbeitszeit-Unterschriften des Mitarbeiters.
// Erscheint wenn:
//  - vorheriger Monat zu Ende UND Mitarbeiter hat Stunden gebucht ABER
//    noch nicht unterschrieben, ODER
//  - Admin hat ueber requestEmployeeSignature einen Datensatz angelegt
//    (z.B. um schon vor Monatsende anzufordern).
export function AzgPendingCard({ userId, employeeName }: Props) {
  const [pending, setPending] = useState<Array<{ monat: number; jahr: number; hasAdminRequest: boolean }>>([]);
  const [activeSignature, setActiveSignature] = useState<{ monat: number; jahr: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchPendingSignaturesForEmployee(userId);
      setPending(list);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live-Sync: bei Aenderungen in azg_signatures (z.B. Admin loest Anfrage aus)
  // oder time_entries (neue Stunden im Vormonat) Liste neu laden.
  useEffect(() => {
    const channel = supabase
      .channel(`azg-pending-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "azg_signatures", filter: `user_id=eq.${userId}` },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refresh]);

  if (loading || pending.length === 0) return null;

  return (
    <>
      <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <p className="font-semibold text-sm">
              {pending.length === 1 ? "Arbeitszeitaufzeichnung" : `${pending.length} Arbeitszeitaufzeichnungen`} zum Unterschreiben
            </p>
          </div>
          <div className="space-y-1.5">
            {pending.map((p) => (
              <button
                key={`${p.jahr}-${p.monat}`}
                onClick={() => setActiveSignature({ monat: p.monat, jahr: p.jahr })}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-white dark:bg-card border hover:border-orange-400 transition-colors"
              >
                <span className="text-sm font-medium">
                  {MONTH_NAMES[p.monat - 1]} {p.jahr}
                  {p.hasAdminRequest && (
                    <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                      · Vom Arbeitgeber angefordert
                    </span>
                  )}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {activeSignature && (
        <AzgEmployeeSignDialog
          open={!!activeSignature}
          onOpenChange={(o) => { if (!o) setActiveSignature(null); }}
          userId={userId}
          employeeName={employeeName}
          monat={activeSignature.monat}
          jahr={activeSignature.jahr}
          monthLabel={MONTH_NAMES[activeSignature.monat - 1]}
          onSigned={refresh}
        />
      )}
    </>
  );
}
