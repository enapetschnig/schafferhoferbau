-- Geraeteverwaltung: eigene Reihung und Archiv (Kundenwunsch Franz, 16.09.2026)
--
-- sort_order:    wie bei projects/profiles - kleinere Zahl = weiter oben,
--                NULL = nicht eingeordnet (kommt hinter den Eingeordneten,
--                alphabetisch). Wird von der App lueckenlos neu vergeben.
-- archiviert_am: gesetzt = Geraet liegt im Archiv. Es verschwindet aus der
--                Hauptliste und aus Auswahlfeldern (z. B. Sicherheits-
--                bewertung), bleibt aber mit Dokumenten, Umlagerungen und
--                Wartungsverlauf erhalten - anders als Loeschen.

alter table public.equipment
  add column if not exists sort_order integer,
  add column if not exists archiviert_am timestamptz;

comment on column public.equipment.sort_order is
  'Reihung in der Geraeteliste, gilt fuer alle. NULL = nicht eingeordnet.';
comment on column public.equipment.archiviert_am is
  'Zeitpunkt der Archivierung. NULL = aktiv.';
