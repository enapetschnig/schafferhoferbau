-- Persistente Ausschluss-Liste pro Baustelle: welche Mitarbeiter sollen in
-- der Stunden-Auswertung (ProjectHoursReport) und im Excel-Export einer
-- bestimmten Baustelle nicht beruecksichtigt werden. Typischer Fall:
-- Bauherr arbeitet mit, soll aber nicht in der Stunden-Summe der Baustelle
-- landen.
--
-- Default ist "kein Ausschluss" (Tabelle leer). Eintrag in dieser Tabelle =
-- "User X wird fuer Projekt Y nicht in die Auswertung gezaehlt".

CREATE TABLE IF NOT EXISTS public.project_excluded_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_excluded_employees_project_idx
  ON public.project_excluded_employees(project_id);
CREATE INDEX IF NOT EXISTS project_excluded_employees_user_idx
  ON public.project_excluded_employees(user_id);

ALTER TABLE public.project_excluded_employees ENABLE ROW LEVEL SECURITY;

-- Lesen: Admin + Vorarbeiter (brauchen es fuer die Auswertung).
DROP POLICY IF EXISTS pee_select ON public.project_excluded_employees;
CREATE POLICY pee_select ON public.project_excluded_employees
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  );

-- Verwalten: Admin + Vorarbeiter duerfen pro Baustelle Mitarbeiter
-- ausschliessen bzw. wieder freigeben.
DROP POLICY IF EXISTS pee_insert ON public.project_excluded_employees;
CREATE POLICY pee_insert ON public.project_excluded_employees
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  );

DROP POLICY IF EXISTS pee_delete ON public.project_excluded_employees;
CREATE POLICY pee_delete ON public.project_excluded_employees
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  );
