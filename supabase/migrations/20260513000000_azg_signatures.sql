-- Arbeitszeitaufzeichnungen — digitale Unterschrift mit Snapshot.
-- Pro Mitarbeiter+Monat eine Zeile. snapshot wird bei der ersten Unterschrift
-- (Mitarbeiter ODER Arbeitgeber) eingefroren, damit spaetere Aenderungen an
-- time_entries die bereits bestaetigte Aufzeichnung nicht mehr ueberschreiben.

CREATE TABLE IF NOT EXISTS azg_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monat int NOT NULL CHECK (monat BETWEEN 1 AND 12),
  jahr int NOT NULL CHECK (jahr BETWEEN 2020 AND 2100),
  snapshot jsonb,
  employee_signature text,
  employee_signed_at timestamptz,
  employer_signature text,
  employer_signed_at timestamptz,
  employer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, monat, jahr)
);

CREATE INDEX IF NOT EXISTS azg_signatures_user_idx ON azg_signatures(user_id);
CREATE INDEX IF NOT EXISTS azg_signatures_period_idx ON azg_signatures(jahr, monat);

ALTER TABLE azg_signatures ENABLE ROW LEVEL SECURITY;

-- Mitarbeiter sieht eigene Eintraege
CREATE POLICY "azg_sig_select_own" ON azg_signatures
  FOR SELECT USING (auth.uid() = user_id);

-- Admin sieht alle
CREATE POLICY "azg_sig_select_admin" ON azg_signatures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

-- Mitarbeiter darf eigene anlegen (seine Unterschrift)
CREATE POLICY "azg_sig_insert_own" ON azg_signatures
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin darf jede anlegen (Anfrage anstossen)
CREATE POLICY "azg_sig_insert_admin" ON azg_signatures
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

-- Mitarbeiter darf eigene updaten (nur seine Felder, app-seitig durchgesetzt)
CREATE POLICY "azg_sig_update_own" ON azg_signatures
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin darf jede updaten
CREATE POLICY "azg_sig_update_admin" ON azg_signatures
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

-- Admin darf loeschen
CREATE POLICY "azg_sig_delete_admin" ON azg_signatures
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

-- Realtime-Publication, damit Dashboards live aktualisieren
ALTER PUBLICATION supabase_realtime ADD TABLE azg_signatures;
