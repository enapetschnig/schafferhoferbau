-- Lieferschein-Erfassung: freier Projektname fuer noch nicht angelegte
-- Projekte. project_id wird optional, dafuer gibt es projekt_freitext.
-- Es muss immer genau eine Zuordnung geben (CHECK).

ALTER TABLE incoming_documents
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE incoming_documents
  ADD COLUMN IF NOT EXISTS projekt_freitext text;

ALTER TABLE incoming_documents
  DROP CONSTRAINT IF EXISTS incoming_documents_projekt_zuordnung_check;

ALTER TABLE incoming_documents
  ADD CONSTRAINT incoming_documents_projekt_zuordnung_check
  CHECK (project_id IS NOT NULL OR projekt_freitext IS NOT NULL);
