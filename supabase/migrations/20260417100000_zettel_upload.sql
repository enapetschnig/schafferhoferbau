-- ============================================================
-- Upload Zettel: Handgeschriebener Bericht als Alternative
-- ============================================================

ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS zettel_scan_url TEXT DEFAULT NULL;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS ist_zettel_upload BOOLEAN DEFAULT false;
