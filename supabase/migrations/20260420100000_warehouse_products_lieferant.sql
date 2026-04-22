-- Spec-Anforderung Lagerverwaltung (Seite 30): Lieferant als Pflichtfeld
-- Wir speichern den Lieferanten pro Produkt (nicht pro Bestand), damit die
-- 11-Spalten-Excel-Struktur 1:1 importierbar bleibt.

ALTER TABLE public.warehouse_products
  ADD COLUMN IF NOT EXISTS lieferant TEXT,
  ADD COLUMN IF NOT EXISTS aufschlag_prozent NUMERIC,
  ADD COLUMN IF NOT EXISTS rechnungsdatum DATE,
  ADD COLUMN IF NOT EXISTS lieferdatum    DATE;
