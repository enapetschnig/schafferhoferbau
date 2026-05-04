-- Pro-User-Favoriten fuer Plan-Dateien (Aktuelle Plaene, Besprechungsprotokolle, Auftraege)
-- file_name fuer Storage-basierte Plaene, document_id fuer text-only Auftraege
CREATE TABLE IF NOT EXISTS public.plan_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_fav_xor CHECK (
    (file_name IS NOT NULL)::int + (document_id IS NOT NULL)::int = 1
  )
);

-- Eindeutigkeit: ein User kann ein File/Doc nur einmal als Favorit haben
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_fav_file
  ON public.plan_favorites (user_id, project_id, file_name)
  WHERE file_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_fav_doc
  ON public.plan_favorites (user_id, project_id, document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plan_fav_lookup
  ON public.plan_favorites (user_id, project_id);

ALTER TABLE public.plan_favorites ENABLE ROW LEVEL SECURITY;

-- Jeder User sieht/aendert nur seine eigenen Favoriten
DROP POLICY IF EXISTS "plan_fav_select_own" ON public.plan_favorites;
CREATE POLICY "plan_fav_select_own" ON public.plan_favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_fav_insert_own" ON public.plan_favorites;
CREATE POLICY "plan_fav_insert_own" ON public.plan_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plan_fav_delete_own" ON public.plan_favorites;
CREATE POLICY "plan_fav_delete_own" ON public.plan_favorites
  FOR DELETE USING (auth.uid() = user_id);
