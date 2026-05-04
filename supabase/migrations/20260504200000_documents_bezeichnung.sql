-- User-gegebene Bezeichnung (Display-Name) zusaetzlich zum technischen Dateinamen
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS bezeichnung TEXT;
