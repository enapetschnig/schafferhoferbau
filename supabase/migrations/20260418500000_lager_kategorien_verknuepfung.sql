-- Lieferant bei Warehouse-Produkten wird Pflichtfeld (wenn ein Produkt aktiv ist muss Lieferant gesetzt sein)
-- Bestehende NULL-Eintraege werden auf "unbekannt" gesetzt
UPDATE warehouse_products SET lieferant = 'unbekannt' WHERE lieferant IS NULL OR lieferant = '';
ALTER TABLE warehouse_products ALTER COLUMN lieferant SET DEFAULT '';
-- Kein strikter NOT NULL Constraint (wegen moeglicher Legacy-Daten), Validierung via UI

-- Kategorie-Stammdaten als eigene Tabelle (ersetzt CHECK-Constraint)
CREATE TABLE IF NOT EXISTS warehouse_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE warehouse_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON warehouse_categories;
CREATE POLICY "categories_select" ON warehouse_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "categories_admin" ON warehouse_categories;
CREATE POLICY "categories_admin" ON warehouse_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'administrator'
    )
  );

-- Seed mit bestehenden Kategorien
INSERT INTO warehouse_categories (slug, label, sort_order) VALUES
  ('kanaele', 'Kanaele', 10),
  ('betonzubehoer', 'Betonzubehoer', 20),
  ('daemmung', 'Daemmung', 30),
  ('kleinteile', 'Kleinteile', 40),
  ('baugeraete', 'Baugeraete', 50),
  ('schalungen', 'Schalungen', 60)
ON CONFLICT (slug) DO NOTHING;

-- CHECK-Constraint auf warehouse_products.category entfernen, damit Kategorien frei sind
-- (category bleibt als TEXT, wird nur ueber UI gegen warehouse_categories gepflegt)
ALTER TABLE warehouse_products DROP CONSTRAINT IF EXISTS warehouse_products_category_check;

-- Verknuepfung Warehouse-Lieferschein -> incoming_documents
-- Spalte um spaeter die Verbindung zum Haupt-Lieferscheine-Bereich herstellen zu koennen
ALTER TABLE warehouse_delivery_notes
  ADD COLUMN IF NOT EXISTS incoming_document_id UUID REFERENCES incoming_documents(id) ON DELETE SET NULL;
