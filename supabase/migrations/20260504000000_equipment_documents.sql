-- Tabelle fuer beliebig viele benannte Dokumente (Foto/PDF) pro Geraet ("Diverses")
CREATE TABLE IF NOT EXISTS public.equipment_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image','pdf')),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_equipment_documents_equipment_id
  ON public.equipment_documents(equipment_id);

ALTER TABLE public.equipment_documents ENABLE ROW LEVEL SECURITY;

-- SELECT fuer alle eingeloggten User (konsistent mit equipment-Tabelle)
DROP POLICY IF EXISTS "equipment_docs_select" ON public.equipment_documents;
CREATE POLICY "equipment_docs_select" ON public.equipment_documents
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE nur Admin oder Vorarbeiter/Facharbeiter
DROP POLICY IF EXISTS "equipment_docs_insert" ON public.equipment_documents;
CREATE POLICY "equipment_docs_insert" ON public.equipment_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM public.employees
               WHERE user_id = auth.uid() AND kategorie IN ('vorarbeiter','facharbeiter'))
  );

DROP POLICY IF EXISTS "equipment_docs_update" ON public.equipment_documents;
CREATE POLICY "equipment_docs_update" ON public.equipment_documents
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM public.employees
               WHERE user_id = auth.uid() AND kategorie IN ('vorarbeiter','facharbeiter'))
  );

DROP POLICY IF EXISTS "equipment_docs_delete" ON public.equipment_documents;
CREATE POLICY "equipment_docs_delete" ON public.equipment_documents
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM public.employees
               WHERE user_id = auth.uid() AND kategorie IN ('vorarbeiter','facharbeiter'))
  );
