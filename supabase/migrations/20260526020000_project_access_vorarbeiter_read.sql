-- Vorarbeiter darf alle project_access-Einträge lesen. Notwendig fuer den
-- Baustellen-Pool im MultiEmployeeSelect (Team-Zeiterfassung): der Vorarbeiter
-- muss sehen koennen, welche Mitarbeiter ueber project_access einem Projekt
-- zugewiesen sind, nicht nur die eigenen Eintraege.
--
-- Analog zu vorarbeiter_read_all_assignments auf worker_assignments
-- (siehe 20260309110000_phase_b_roles_working_hours.sql).

DROP POLICY IF EXISTS "Vorarbeiter can read all project_access" ON public.project_access;
CREATE POLICY "Vorarbeiter can read all project_access"
  ON public.project_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE user_id = auth.uid()
      AND kategorie = 'vorarbeiter'
    )
  );
