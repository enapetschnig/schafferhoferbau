-- ============================================================
-- Lagerverwaltung: Erweiterte Felder fuer 11-Spalten Excel-Struktur
-- ============================================================

ALTER TABLE warehouse_products ADD COLUMN IF NOT EXISTS aufschlag_prozent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE warehouse_products ADD COLUMN IF NOT EXISTS rechnungsdatum DATE DEFAULT NULL;
ALTER TABLE warehouse_products ADD COLUMN IF NOT EXISTS lieferdatum DATE DEFAULT NULL;
ALTER TABLE warehouse_products ADD COLUMN IF NOT EXISTS lieferant TEXT DEFAULT NULL;
