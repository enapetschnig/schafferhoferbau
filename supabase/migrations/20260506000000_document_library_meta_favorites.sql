-- Pro-Datei-Metadaten (Bezeichnung + Notiz) fuer die Dokumentenbibliothek
CREATE TABLE IF NOT EXISTS public.document_library_meta (
  file_path TEXT PRIMARY KEY,
  bezeichnung TEXT,
  beschreibung TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_library_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_lib_meta_select" ON public.document_library_meta;
CREATE POLICY "doc_lib_meta_select" ON public.document_library_meta
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "doc_lib_meta_write" ON public.document_library_meta;
CREATE POLICY "doc_lib_meta_write" ON public.document_library_meta
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM public.employees WHERE user_id = auth.uid()
               AND kategorie IN ('vorarbeiter','facharbeiter'))
  );

-- Pro-User-Favoriten fuer die Dokumentenbibliothek
CREATE TABLE IF NOT EXISTS public.document_library_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_lib_fav
  ON public.document_library_favorites (user_id, file_path);

CREATE INDEX IF NOT EXISTS idx_doc_lib_fav_lookup
  ON public.document_library_favorites (user_id);

ALTER TABLE public.document_library_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doc_lib_fav_own" ON public.document_library_favorites;
CREATE POLICY "doc_lib_fav_own" ON public.document_library_favorites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
