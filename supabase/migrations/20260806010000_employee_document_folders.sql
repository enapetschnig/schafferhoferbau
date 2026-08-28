-- Ordner innerhalb der Personalunterlagen-Arten (eine Ebene)
--
-- Die Ordner gelten fuer ALLE Mitarbeiter gleich - so bleibt die Ablage
-- einheitlich. Sie sind reine Zuordnung: der Storage-Pfad bleibt
-- {user_id}/{kategorie}/{datei} bzw. intern/... Ein Dokument in einen anderen
-- Ordner zu schieben ist damit ein reines UPDATE ohne Datei-Umzug, und die
-- Storage-Policies aus 20260806000000 bleiben unveraendert gueltig.

CREATE TABLE IF NOT EXISTS public.employee_document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategorie text NOT NULL
    CHECK (kategorie IN ('anmeldung', 'dienstvertrag', 'zeugnis', 'sonstiges')),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kategorie, name)
);

ALTER TABLE public.employee_document_folders ENABLE ROW LEVEL SECURITY;

-- Ordnernamen darf jeder Angemeldete lesen - der Mitarbeiter braucht sie zur
-- Gruppierung seiner eigenen Unterlagen. Die Unterlagen selbst bleiben durch
-- die RLS auf employee_documents geschuetzt.
DROP POLICY IF EXISTS "Angemeldete lesen Unterlagen-Ordner" ON public.employee_document_folders;
CREATE POLICY "Angemeldete lesen Unterlagen-Ordner"
  ON public.employee_document_folders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin verwaltet Unterlagen-Ordner" ON public.employee_document_folders;
CREATE POLICY "Admin verwaltet Unterlagen-Ordner"
  ON public.employee_document_folders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'administrator'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'administrator'
    )
  );

-- Zuordnung am Dokument. ON DELETE SET NULL: wird ein Ordner geloescht,
-- rutschen seine Dokumente zurueck auf "Ohne Ordner" statt verloren zu gehen.
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES public.employee_document_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_documents_folder
  ON public.employee_documents (folder_id)
  WHERE folder_id IS NOT NULL;
