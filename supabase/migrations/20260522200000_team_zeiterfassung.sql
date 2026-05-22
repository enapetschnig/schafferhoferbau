-- Team-Zeiterfassung: Vorarbeiter darf fuer zugewiesene Mitarbeiter Zeiten
-- erfassen. Externe Mitarbeiter werden ueber eine dauerhafte Baustellen-
-- Freigabe (external_employee_projects) gesteuert.

-- ===== external_employee_projects =====
-- Pro externem Mitarbeiter die Baustellen, fuer die er freigegeben ist.
CREATE TABLE IF NOT EXISTS external_employee_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (employee_user_id, project_id)
);

CREATE INDEX IF NOT EXISTS external_employee_projects_user_idx ON external_employee_projects(employee_user_id);
CREATE INDEX IF NOT EXISTS external_employee_projects_project_idx ON external_employee_projects(project_id);

ALTER TABLE external_employee_projects ENABLE ROW LEVEL SECURITY;

-- Lesen: Admin + Vorarbeiter (brauchen es fuer den Mitarbeiter-Pool)
DROP POLICY IF EXISTS eep_select ON external_employee_projects;
CREATE POLICY eep_select ON external_employee_projects
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
    OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  );

-- Verwalten: nur Admin
DROP POLICY IF EXISTS eep_insert ON external_employee_projects;
CREATE POLICY eep_insert ON external_employee_projects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

DROP POLICY IF EXISTS eep_update ON external_employee_projects;
CREATE POLICY eep_update ON external_employee_projects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

DROP POLICY IF EXISTS eep_delete ON external_employee_projects;
CREATE POLICY eep_delete ON external_employee_projects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

-- ===== time_entries: Vorarbeiter darf fuer andere erfassen =====
-- Bisher hatte der Vorarbeiter nur SELECT. Fuer die Team-Zeiterfassung
-- braucht er INSERT/UPDATE/DELETE (analog zu den bestehenden Admin-Policies).
DROP POLICY IF EXISTS "Vorarbeiter can insert time entries" ON time_entries;
CREATE POLICY "Vorarbeiter can insert time entries" ON time_entries
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter')
  );

DROP POLICY IF EXISTS "Vorarbeiter can update time entries" ON time_entries;
CREATE POLICY "Vorarbeiter can update time entries" ON time_entries
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter')
  );

DROP POLICY IF EXISTS "Vorarbeiter can delete time entries" ON time_entries;
CREATE POLICY "Vorarbeiter can delete time entries" ON time_entries
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter')
  );
