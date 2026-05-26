-- Verschaerft die Vorarbeiter-Policies auf time_entries: Der Vorarbeiter
-- darf nur fuer Mitarbeiter buchen / aendern / loeschen, die der Baustelle
-- aktuell zugewiesen sind. Quellen der Zuweisung (analog zum Pool im
-- MultiEmployeeSelect):
--   1. worker_assignments (Plantafel, Datum-genau)
--   2. project_access     (datumsunabhaengig, intern)
--   3. external_employee_projects (datumsunabhaengig, extern/bauherr)
-- Zusaetzlich muss der Target-User aktiv sein (profiles.is_active = true).
-- Eigene Stunden des Vorarbeiters sind immer erlaubt.
-- Bei time_entries.project_id IS NULL (z.B. Werkstatt-Zeit ohne Projekt):
-- nur Aktiv-Check, kein Projekt-Zuweisungs-Check.

-- Hilfs-Funktion fuer die Re-Use in Insert/Update/Delete-Policies.
CREATE OR REPLACE FUNCTION public.vorarbeiter_can_book_for(
  _target_user uuid,
  _target_project uuid,
  _target_datum date
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _target_user IS NULL THEN
    RETURN false;
  END IF;
  -- Eigene Stunden des Vorarbeiters: immer erlaubt.
  IF _target_user = auth.uid() THEN
    RETURN true;
  END IF;
  -- Target-User muss aktiv sein (Sperre = sofort nicht mehr buchbar).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _target_user AND is_active = true
  ) THEN
    RETURN false;
  END IF;
  -- Werkstatt-Zeit ohne Projekt: nur Aktiv-Check reicht.
  IF _target_project IS NULL THEN
    RETURN true;
  END IF;
  -- Target muss dem Projekt zugewiesen sein (eine von drei Quellen).
  RETURN (
    EXISTS (
      SELECT 1 FROM public.worker_assignments wa
      WHERE wa.user_id = _target_user
        AND wa.project_id = _target_project
        AND wa.datum = _target_datum
    )
    OR EXISTS (
      SELECT 1 FROM public.project_access pa
      WHERE pa.user_id = _target_user
        AND pa.project_id = _target_project
    )
    OR EXISTS (
      SELECT 1 FROM public.external_employee_projects eep
      WHERE eep.employee_user_id = _target_user
        AND eep.project_id = _target_project
    )
  );
END;
$$;

-- Berechtigung fuer den Aufruf
GRANT EXECUTE ON FUNCTION public.vorarbeiter_can_book_for(uuid, uuid, date) TO authenticated;

-- ===== Insert =====
DROP POLICY IF EXISTS "Vorarbeiter can insert time entries" ON public.time_entries;
CREATE POLICY "Vorarbeiter can insert time entries" ON public.time_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter'
    )
    AND public.vorarbeiter_can_book_for(user_id, project_id, datum)
  );

-- ===== Update =====
-- USING prueft die ALTE Zeile, WITH CHECK die NEUE — beides muss durchgehen.
DROP POLICY IF EXISTS "Vorarbeiter can update time entries" ON public.time_entries;
CREATE POLICY "Vorarbeiter can update time entries" ON public.time_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter'
    )
    AND public.vorarbeiter_can_book_for(user_id, project_id, datum)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter'
    )
    AND public.vorarbeiter_can_book_for(user_id, project_id, datum)
  );

-- ===== Delete =====
DROP POLICY IF EXISTS "Vorarbeiter can delete time entries" ON public.time_entries;
CREATE POLICY "Vorarbeiter can delete time entries" ON public.time_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND e.kategorie = 'vorarbeiter'
    )
    AND public.vorarbeiter_can_book_for(user_id, project_id, datum)
  );
