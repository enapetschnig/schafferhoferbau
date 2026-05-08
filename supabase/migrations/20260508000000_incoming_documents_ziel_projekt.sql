-- Zielbaustelle bei Retourlieferscheinen: Ware geht von project_id (Quelle)
-- nach ziel_projekt_id (Ziel). NULL = zurueck ins Lager.
ALTER TABLE incoming_documents
  ADD COLUMN IF NOT EXISTS ziel_projekt_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS incoming_documents_ziel_projekt_id_idx
  ON incoming_documents(ziel_projekt_id);
