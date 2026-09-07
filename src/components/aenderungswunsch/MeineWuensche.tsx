import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  gruppiereWuensche,
  anzeigestatus,
  istNeuErledigt,
  STATUS_LABEL,
} from "@/lib/meineWuensche";

/**
 * Cast noetig: generierte Supabase-Types kennen aenderungswuensche nicht.
 * ACHTUNG: supabase.storage.from("aenderungswuensche") NICHT casten.
 */
const aenderungTable = () => (supabase.from("aenderungswuensche" as never) as any);

interface Wunsch {
  id: string;
  text: string;
  art: string;
  status: string;
  antwort: string | null;
  melder_gesehen_am: string | null;
  created_at: string;
  updated_at: string;
}

const ART_LABEL: Record<string, string> = {
  wunsch: "Wunsch",
  fehler: "Fehler",
  frage: "Frage",
};

/**
 * "Meine Änderungswünsche" auf der Startseite.
 *
 * Ersetzt die frühere Nur-Erledigt-Meldung: Ein abgeschickter Wunsch bleibt
 * sichtbar und steht unter "Offen", bis er umgesetzt ist (Kundenwunsch
 * 06.09.2026). Frisch Erledigte werden hervorgehoben, bis man sie zur
 * Kenntnis nimmt - danach bleiben sie unter "Erledigt" stehen.
 */
export function MeineWuensche() {
  const [wuensche, setWuensche] = useState<Wunsch[]>([]);
  const [offenAufgeklappt, setOffenAufgeklappt] = useState(true);
  const [erledigtAufgeklappt, setErledigtAufgeklappt] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);

  const laden = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await aenderungTable()
      .select("id, text, art, status, antwort, melder_gesehen_am, created_at, updated_at")
      .eq("erstellt_von", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    setWuensche((data ?? []) as Wunsch[]);
  }, []);

  useEffect(() => { laden(); }, [laden]);

  const zurKenntnis = async (ids: string[]) => {
    if (!ids.length) return;
    setArbeitet(true);
    const jetzt = new Date().toISOString();
    await aenderungTable().update({ melder_gesehen_am: jetzt } as never).in("id", ids);
    // Nur die Hervorhebung nehmen - der Eintrag bleibt in der Liste
    setWuensche((alt) =>
      alt.map((w) => (ids.includes(w.id) ? { ...w, melder_gesehen_am: jetzt } : w))
    );
    setArbeitet(false);
  };

  if (wuensche.length === 0) return null;

  const { offen, erledigt, neuErledigt } = gruppiereWuensche(wuensche);

  const zeile = (w: Wunsch) => {
    const status = anzeigestatus(w.status);
    const hervorgehoben = istNeuErledigt(w);
    return (
      <div
        key={w.id}
        className={`rounded-md border p-2.5 space-y-1 ${
          hervorgehoben ? "border-emerald-300 bg-emerald-50/70" : "bg-background/60"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={
              status === "erledigt"
                ? "border-emerald-400 text-emerald-700"
                : status === "abgelehnt"
                ? "border-muted-foreground/40 text-muted-foreground"
                : "border-amber-400 text-amber-700"
            }
          >
            {status === "erledigt" ? (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            ) : status === "abgelehnt" ? (
              <XCircle className="h-3 w-3 mr-1" />
            ) : (
              <Clock className="h-3 w-3 mr-1" />
            )}
            {STATUS_LABEL[status]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {ART_LABEL[w.art] || w.art} · {new Date(w.created_at).toLocaleDateString("de-DE")}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words line-clamp-4">{w.text}</p>
        {w.antwort && (
          <p className="text-xs bg-muted/60 rounded px-2 py-1">
            <span className="font-medium">Antwort:</span> {w.antwort}
          </p>
        )}
      </div>
    );
  };

  const abschnitt = (
    titel: string,
    eintraege: Wunsch[],
    offenState: boolean,
    setOffenState: (v: boolean) => void
  ) =>
    eintraege.length > 0 && (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOffenState(!offenState)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary"
        >
          {offenState ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {titel}
          <Badge variant="secondary" className="ml-1">{eintraege.length}</Badge>
        </button>
        {offenState && <div className="space-y-2">{eintraege.map(zeile)}</div>}
      </div>
    );

  return (
    <Card className="mb-4">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold">Meine Änderungswünsche</h3>
          {neuErledigt.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={arbeitet}
              onClick={() => zurKenntnis(neuErledigt.map((w) => w.id))}
            >
              {neuErledigt.length === 1
                ? "Erledigung zur Kenntnis"
                : `${neuErledigt.length} Erledigungen zur Kenntnis`}
            </Button>
          )}
        </div>

        {abschnitt("Offen", offen, offenAufgeklappt, setOffenAufgeklappt)}
        {abschnitt("Erledigt", erledigt, erledigtAufgeklappt, setErledigtAufgeklappt)}
      </CardContent>
    </Card>
  );
}
