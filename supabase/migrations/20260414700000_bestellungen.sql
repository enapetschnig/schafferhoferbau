-- ============================================================
-- Bestellungen-Modul
-- ============================================================

-- Bestellungen Tabelle
CREATE TABLE IF NOT EXISTS bestellungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  erstellt_von UUID NOT NULL REFERENCES auth.users(id),
  typ TEXT NOT NULL DEFAULT 'mitarbeiter' CHECK (typ IN ('chef', 'mitarbeiter')),
  titel TEXT NOT NULL,
  beschreibung TEXT,
  status TEXT NOT NULL DEFAULT 'angefragt' CHECK (status IN ('angefragt', 'teilweise_bestellt', 'bestellt', 'offen', 'nicht_vollstaendig', 'vollstaendig')),
  -- Chef-Bestellungen: offen -> nicht_vollstaendig -> vollstaendig
  -- MA-Bestellungen: angefragt -> teilweise_bestellt -> bestellt
  lieferant TEXT,
  dokument_url TEXT,
  notizen TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bestellpositionen
CREATE TABLE IF NOT EXISTS bestellpositionen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id UUID NOT NULL REFERENCES bestellungen(id) ON DELETE CASCADE,
  artikel TEXT NOT NULL,
  menge NUMERIC(10,2),
  einheit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE bestellungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellpositionen ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten User koennen Bestellungen sehen
CREATE POLICY "Authenticated can read bestellungen" ON bestellungen FOR SELECT
  USING (auth.role() = 'authenticated');

-- MA koennen eigene Bestellungen erstellen
CREATE POLICY "Users can create bestellungen" ON bestellungen FOR INSERT
  WITH CHECK (auth.uid() = erstellt_von);

-- Admin kann alles (update status, etc.)
CREATE POLICY "Admins can manage bestellungen" ON bestellungen FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'administrator'));

-- MA koennen eigene Bestellungen updaten (Status bei Chef-Bestellungen)
CREATE POLICY "Users can update own bestellungen" ON bestellungen FOR UPDATE
  USING (auth.uid() = erstellt_von);

-- Positionen: gleiche Rechte
CREATE POLICY "Authenticated can read positionen" ON bestellpositionen FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Users can create positionen" ON bestellpositionen FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage positionen" ON bestellpositionen FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'administrator'));

-- Storage Bucket fuer Bestelldokumente
INSERT INTO storage.buckets (id, name, public)
VALUES ('bestellungen', 'bestellungen', false)
ON CONFLICT (id) DO NOTHING;
