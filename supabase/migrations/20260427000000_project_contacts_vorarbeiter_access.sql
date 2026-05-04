-- project_contacts: Vorarbeiter (employees.kategorie='vorarbeiter') sehen alle Kontakte,
-- auch ohne Plantafel-Einteilung auf das Projekt.
--
-- Hintergrund: Bisher konnten nur Admins (RLS admin_all_contacts) und Mitarbeiter mit
-- aktiver worker_assignment auf das Projekt die Kontakte sehen. Vorarbeiter mit
-- App-Rolle 'mitarbeiter' (weil das app_role-Enum kein 'vorarbeiter' kennt) waren bei
-- neu hinzugefuegten Vorarbeitern ohne Plantafel-Eintrag ausgesperrt.
--
-- Loesung: Policy erweitern um zusaetzliche Bedingung auf employees.kategorie='vorarbeiter'.

DROP POLICY IF EXISTS user_read_assigned_contacts ON public.project_contacts;

CREATE POLICY user_read_assigned_contacts ON public.project_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM worker_assignments
      WHERE worker_assignments.user_id = auth.uid()
        AND worker_assignments.project_id = project_contacts.project_id
    )
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE employees.user_id = auth.uid()
        AND employees.kategorie = 'vorarbeiter'
    )
  );
