-- Buchhaltung: Eingangsrechnungen scannen + als Excel-Jahresliste sammeln.
-- Nur fuer Admins. Eine Rechnung (buchhaltung_rechnungen) hat n Positionen
-- (buchhaltung_positionen). snapshot-frei — die Daten sind direkt editierbar.

-- ===== Tabellen =====

CREATE TABLE IF NOT EXISTS buchhaltung_rechnungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datei_name text,
  pdf_url text,
  lieferant text,
  belegnummer text,
  rechnungsdatum date,
  lieferdatum date,
  betrag_netto numeric,
  betrag_brutto numeric,
  jahr int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS buchhaltung_rechnungen_jahr_idx ON buchhaltung_rechnungen(jahr);

CREATE TABLE IF NOT EXISTS buchhaltung_positionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rechnung_id uuid NOT NULL REFERENCES buchhaltung_rechnungen(id) ON DELETE CASCADE,
  baustelle text,
  menge numeric,
  einheit text,
  artikelbezeichnung text,
  ek_preis numeric,
  aufschlag numeric NOT NULL DEFAULT 0,
  sortierung int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buchhaltung_positionen_rechnung_idx ON buchhaltung_positionen(rechnung_id);

-- ===== RLS — nur Administratoren =====

ALTER TABLE buchhaltung_rechnungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE buchhaltung_positionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buchhaltung_rechnungen_admin ON buchhaltung_rechnungen;
CREATE POLICY buchhaltung_rechnungen_admin ON buchhaltung_rechnungen
  FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role));

DROP POLICY IF EXISTS buchhaltung_positionen_admin ON buchhaltung_positionen;
CREATE POLICY buchhaltung_positionen_admin ON buchhaltung_positionen
  FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role));

-- ===== Storage-Bucket fuer die Original-PDFs =====

INSERT INTO storage.buckets (id, name, public)
VALUES ('buchhaltung', 'buchhaltung', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS buchhaltung_bucket_admin ON storage.objects;
CREATE POLICY buchhaltung_bucket_admin ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'buchhaltung'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  )
  WITH CHECK (
    bucket_id = 'buchhaltung'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );
