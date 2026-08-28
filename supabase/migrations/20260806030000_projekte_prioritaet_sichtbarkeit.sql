-- Projekte und Plantafel: Reihenfolge nach Prioritaet + Ausblenden
--
-- Beides sind ADMIN-Einstellungen und gelten fuer alle: was hier ausgeblendet
-- bzw. sortiert wird, sieht auch der Mitarbeiter am Handy so. Deshalb Spalten
-- an den Stammdaten und keine benutzerbezogene Tabelle.
--
-- Ausblenden ist rein eine Anzeige-Entscheidung: bestehende Zeiteintraege,
-- Berichte und Zuordnungen bleiben unangetastet, das Projekt verschwindet nur
-- aus den Listen. Administratoren koennen ausgeblendete Projekte weiterhin
-- einblenden.

-- Prioritaet: kleinere Zahl = weiter oben. NULL = keine Prioritaet -> ans Ende.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sort_order integer;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS in_app_sichtbar boolean NOT NULL DEFAULT true;

-- Teilindex: nur priorisierte Projekte landen im Index
CREATE INDEX IF NOT EXISTS idx_projects_sort_order
  ON public.projects (sort_order)
  WHERE sort_order IS NOT NULL;

-- Plantafel: einzelne Mitarbeiter ausblenden.
-- Die Reihenfolge kommt aus dem bereits vorhandenen profiles.sort_order
-- (wird im Admin-Bereich per Drag & Drop gepflegt) - keine zweite Quelle.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plantafel_sichtbar boolean NOT NULL DEFAULT true;
