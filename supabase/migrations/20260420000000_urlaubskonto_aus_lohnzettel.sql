-- Urlaubskonto kommt nun direkt aus den Lohnzetteln (KI-Extraktion beim Upload).
-- Basisdaten werden pro Lohnzettel gespeichert; MyHours zeigt den neuesten
-- Datenstand mit Gegenrechnung des Verbrauchs seit dem Stichtag.

ALTER TABLE public.payslip_metadata
  ADD COLUMN IF NOT EXISTS urlaubsanspruch NUMERIC,
  ADD COLUMN IF NOT EXISTS resturlaub      NUMERIC,
  ADD COLUMN IF NOT EXISTS urlaub_einheit  TEXT CHECK (urlaub_einheit IN ('tage', 'stunden')),
  ADD COLUMN IF NOT EXISTS stichtag        DATE;

-- Praeferenz pro Mitarbeiter: einige MA (z.B. Mauerhofer Hans Juergen) fuehren
-- ihren Resturlaub in Stunden statt Tagen. Wenn gesetzt, ueberschreibt es die
-- automatische Erkennung aus dem Lohnzettel.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS urlaub_einheit_preferred TEXT
  CHECK (urlaub_einheit_preferred IN ('tage', 'stunden'));

-- Index fuer den haeufigen "neuester Lohnzettel pro User"-Lookup
CREATE INDEX IF NOT EXISTS idx_payslip_metadata_user_stichtag
  ON public.payslip_metadata (user_id, stichtag DESC NULLS LAST);

-- file_path nullable machen, damit Admin auch ohne PDF-Upload einen manuellen
-- Urlaubs-Snapshot setzen kann (z.B. bei MA die keinen Lohnzettel haben)
ALTER TABLE public.payslip_metadata ALTER COLUMN file_path DROP NOT NULL;
