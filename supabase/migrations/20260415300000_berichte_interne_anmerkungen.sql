-- Interne Anmerkungen fuer Berichte (optional mitdruckbar)
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS interne_anmerkungen TEXT DEFAULT NULL;
