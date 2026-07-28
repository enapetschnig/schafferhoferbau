import { useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type ReadEntry = { user_id: string; read_at: string };
export type Recipient = { id: string; name: string };

interface Props {
  /** Alle Lese-Eintraege zu dieser Nachricht. */
  reads: ReadEntry[];
  /** Empfaengerkreis (ohne Absender) — Basis fuer "von allen gelesen". */
  recipients: Recipient[];
  /** Nur Absender und Admins duerfen Lesebestaetigungen sehen. */
  visible: boolean;
  /** Optionaler Style-Hinweis fuer helle Sprechblasen. */
  className?: string;
}

/**
 * WhatsApp-artige Lesebestaetigung:
 *  - ein grauer Haken   = gesendet, noch niemand hat gelesen
 *  - zwei graue Haken   = teilweise gelesen
 *  - zwei blaue Haken   = von allen Empfaengern gelesen
 * Tippen oeffnet die Namensliste (gelesen / noch nicht gelesen).
 */
export function ReadReceipt({ reads, recipients, visible, className }: Props) {
  const [open, setOpen] = useState(false);
  if (!visible) return null;

  // Nur Leser zaehlen, die auch zum Empfaengerkreis gehoeren — so verfaelschen
  // z.B. spaeter entfernte Projekt-Mitglieder die "alle gelesen"-Anzeige nicht.
  const recipientIds = new Set(recipients.map((r) => r.id));
  const relevantReads = reads.filter((r) => recipientIds.has(r.user_id));
  const readCount = relevantReads.length;
  const total = recipients.length;
  const allRead = total > 0 && readCount >= total;

  const readByIds = new Set(relevantReads.map((r) => r.user_id));
  const readList = recipients
    .filter((r) => readByIds.has(r.id))
    .map((r) => ({
      ...r,
      read_at: relevantReads.find((x) => x.user_id === r.id)?.read_at,
    }))
    .sort((a, b) => (a.read_at || "").localeCompare(b.read_at || ""));
  const pendingList = recipients.filter((r) => !readByIds.has(r.id));

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          "inline-flex items-center gap-0.5 align-middle hover:opacity-70 transition-opacity",
          className
        )}
        title={
          total === 0
            ? "Gesendet"
            : allRead
            ? "Von allen gelesen — tippen für Details"
            : `${readCount} von ${total} gelesen — tippen für Details`
        }
        aria-label="Lesebestätigungen anzeigen"
      >
        {readCount === 0 ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <CheckCheck className={cn("h-3.5 w-3.5", allRead && "text-sky-400")} />
        )}
        {total > 0 && !allRead && readCount > 0 && (
          <span className="text-[10px] leading-none">{readCount}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CheckCheck className={cn("h-4 w-4", allRead && "text-sky-500")} />
              Gelesen von {readCount} / {total}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Gelesen</p>
              {readList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch niemand hat die Nachricht gelesen.</p>
              ) : (
                <ul className="space-y-1">
                  {readList.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{r.name}</span>
                      {r.read_at && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {format(new Date(r.read_at), "dd.MM. HH:mm", { locale: de })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {pendingList.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Noch nicht gelesen ({pendingList.length})
                </p>
                <ul className="space-y-1">
                  {pendingList.map((r) => (
                    <li key={r.id} className="text-sm text-muted-foreground truncate">
                      {r.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
