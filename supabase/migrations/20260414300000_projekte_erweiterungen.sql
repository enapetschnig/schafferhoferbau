-- ============================================================
-- Projekte Erweiterungen
-- ============================================================

-- 1: Baustellenart (Regie/Pauschale) + Bauherr 2 + >100km
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baustellenart TEXT DEFAULT NULL
  CHECK (baustellenart IN ('regie', 'pauschale'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bauherr2 TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bauherr2_kontakt TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS anfahrt_ueber_100km BOOLEAN DEFAULT false;

-- 2: Projektkontakte: sort_order fuer Sortierung
ALTER TABLE project_contacts ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 3: Standard-Kontakte (Notfallnummern etc.) als App-Setting
INSERT INTO app_settings (key, value) VALUES
  ('default_project_contacts', '[{"name":"Rettung","telefon":"144","rolle":"Notfall"},{"name":"Feuerwehr","telefon":"122","rolle":"Notfall"},{"name":"Polizei","telefon":"133","rolle":"Notfall"},{"name":"EU-Notruf","telefon":"112","rolle":"Notfall"},{"name":"Vergiftungsinformationszentrale","telefon":"01 406 43 43","rolle":"Notfall"}]')
ON CONFLICT (key) DO NOTHING;
