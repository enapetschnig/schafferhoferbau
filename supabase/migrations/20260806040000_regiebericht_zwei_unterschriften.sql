-- Berichte: Mitarbeiter- und Kundenunterschrift trennen
--
-- Bisher gab es nur EIN Unterschriftsfeld (unterschrift_kunde). Unterschrieben
-- hat dort aber faktisch der Mitarbeiter - der Bericht galt danach trotzdem als
-- "Kunde unterschrieben".
--
-- Neu: Der Mitarbeiter unterschreibt und bestaetigt den Bericht. Die
-- Kundenunterschrift kommt danach separat dazu und ist optional - ohne sie
-- bleibt der Bericht als "Kundenunterschrift ausstaendig" offen.
--
-- unterschrift_kunde/-am/-name bleiben unveraendert die KUNDEN-Unterschrift.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS unterschrift_mitarbeiter TEXT,
  ADD COLUMN IF NOT EXISTS unterschrift_mitarbeiter_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unterschrift_mitarbeiter_name TEXT;

-- BESTANDSDATEN BLEIBEN BEWUSST UNVERAENDERT.
--
-- Bisherige Unterschriften stehen weiterhin in unterschrift_kunde und gelten
-- damit als Kundenunterschrift. Ob dort tatsaechlich der Kunde oder der
-- Mitarbeiter unterschrieben hat, laesst sich nachtraeglich nicht feststellen -
-- das Namensfeld war zwar mit dem angemeldeten Benutzer vorbelegt, konnte aber
-- ueberschrieben werden.
--
-- Unterschriften nachtraeglich einer anderen Person zuzuordnen oder zu loeschen
-- waere nicht umkehrbar, deshalb wird hier nichts umgeschrieben. Die neue
-- Trennung greift ab dem naechsten Bericht.
