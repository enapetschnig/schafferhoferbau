-- Lieferscheine & Rechnungen: mehrseitige Dokumente + Fotos der Ware
ALTER TABLE incoming_documents
  ADD COLUMN IF NOT EXISTS zusatz_seiten_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS waren_fotos_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ist_retour BOOLEAN DEFAULT FALSE;
