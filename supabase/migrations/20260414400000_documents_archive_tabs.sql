-- ============================================================
-- Dokumente: Archiv + Sub-Typen fuer Reiter
-- ============================================================

-- archived Flag fuer Archiv-Funktion
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- sub_type fuer Unter-Kategorien innerhalb eines Typs
-- z.B. bei plans: "plan", "besprechungsprotokoll", "auftrag"
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sub_type TEXT DEFAULT NULL;

-- Index fuer schnelle Filterung
CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(project_id, typ, archived);
