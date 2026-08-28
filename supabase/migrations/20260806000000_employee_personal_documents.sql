-- Personalunterlagen je Mitarbeiter (Anmeldungen, Dienstvertraege, Zeugnisse, Sonstiges)
--
-- Dateien liegen im bestehenden privaten Bucket 'employee-documents'.
-- Pfad-Konvention:
--   sichtbar fuer MA : {user_id}/{kategorie}/{ts}_{rand}_{name}
--   nur intern       : intern/{user_id}/{kategorie}/{ts}_{rand}_{name}
--   MA ohne Zugang   : intern/{employee_id}/{kategorie}/{ts}_{rand}_{name}
-- Der 'intern/'-Praefix ist die eigentliche Absicherung: die Mitarbeiter-Policy
-- prueft (storage.foldername(name))[1] = auth.uid() und greift dort nicht.

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  -- NULL bei Mitarbeitern ohne App-Zugang
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kategorie text NOT NULL
    CHECK (kategorie IN ('anmeldung', 'dienstvertrag', 'zeugnis', 'sonstiges')),
  bezeichnung text NOT NULL,
  dokument_datum date,
  notizen text,
  file_path text NOT NULL UNIQUE,
  sichtbar_fuer_mitarbeiter boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON public.employee_documents (employee_id, kategorie);

CREATE INDEX IF NOT EXISTS idx_employee_documents_user
  ON public.employee_documents (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- Mitarbeiter sehen ihre eigenen, freigegebenen Unterlagen; Admin sieht alles
DROP POLICY IF EXISTS "User lesen eigene Personalunterlagen" ON public.employee_documents;
CREATE POLICY "User lesen eigene Personalunterlagen"
  ON public.employee_documents FOR SELECT
  TO authenticated
  USING (
    (sichtbar_fuer_mitarbeiter AND employee_documents.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'administrator'
    )
  );

DROP POLICY IF EXISTS "Admin verwaltet Personalunterlagen" ON public.employee_documents;
CREATE POLICY "Admin verwaltet Personalunterlagen"
  ON public.employee_documents FOR ALL
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

-- updated_at automatisch mitfuehren (Funktion existiert bereits aus der Ur-Migration)
DROP TRIGGER IF EXISTS update_employee_documents_updated_at ON public.employee_documents;
CREATE TRIGGER update_employee_documents_updated_at
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Storage-Policies fuer 'employee-documents' nachziehen
-- ---------------------------------------------------------------------------

-- Bisher durfte jeder Mitarbeiter in JEDEN Unterordner seiner eigenen UID
-- schreiben - er koennte sich also selbst einen "Dienstvertrag" ablegen.
-- Die neuen Personalunterlagen-Ordner und lohnzettel werden ausgenommen.
--
-- WICHTIG: COALESCE muss bleiben. TimeTracking.tsx laedt den Krankenstands-Beleg
-- ohne Unterordner nach {user_id}/{datei} hoch - dort ist [2] NULL.
DROP POLICY IF EXISTS "Authenticated users can upload employee documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload employee documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND COALESCE((storage.foldername(name))[2], '') <> ALL
        (ARRAY['anmeldung', 'dienstvertrag', 'zeugnis', 'sonstiges', 'lohnzettel'])
  );

-- Admin-Upload defensiv neu anlegen: die Policy stammt aus 20251115092510 und
-- wurde nie gedroppt, aber so ist die Migration unabhaengig vom Live-Stand.
DROP POLICY IF EXISTS "Admins can upload employee documents" ON storage.objects;
CREATE POLICY "Admins can upload employee documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND has_role(auth.uid(), 'administrator'::app_role)
  );
