-- Role-based menu visibility settings
-- Allows admins to configure which menu items each role can see

CREATE TABLE IF NOT EXISTS role_menu_settings (
  role TEXT NOT NULL,
  menu_key TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (role, menu_key)
);

ALTER TABLE role_menu_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed by Index.tsx to load their role's settings)
CREATE POLICY "read_role_menu_settings"
  ON role_menu_settings FOR SELECT TO authenticated USING (true);

-- Only administrators can write
CREATE POLICY "admin_write_role_menu_settings"
  ON role_menu_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator'));

-- Insert defaults matching current hardcoded visibility logic
INSERT INTO role_menu_settings (role, menu_key, visible) VALUES
  -- extern: only basic items
  ('extern', 'zeiterfassung', true),
  ('extern', 'projekte', false),
  ('extern', 'meine_stunden', true),
  ('extern', 'regiearbeiten', false),
  ('extern', 'tagesberichte', false),
  ('extern', 'meine_dokumente', false),
  ('extern', 'dokumentenbibliothek', false),
  ('extern', 'stundenubersicht', false),
  ('extern', 'plantafel', false),
  ('extern', 'gerateverwaltung', false),
  ('extern', 'eingangsrechnungen', false),
  ('extern', 'evaluierungen', false),
  ('extern', 'arbeitsschutz', false),
  ('extern', 'lieferscheine', false),
  ('extern', 'lagerverwaltung', false),
  ('extern', 'admin_bereich', false),

  -- lehrling
  ('lehrling', 'zeiterfassung', true),
  ('lehrling', 'projekte', false),
  ('lehrling', 'meine_stunden', true),
  ('lehrling', 'regiearbeiten', false),
  ('lehrling', 'tagesberichte', false),
  ('lehrling', 'meine_dokumente', true),
  ('lehrling', 'dokumentenbibliothek', false),
  ('lehrling', 'stundenubersicht', false),
  ('lehrling', 'plantafel', false),
  ('lehrling', 'gerateverwaltung', false),
  ('lehrling', 'eingangsrechnungen', false),
  ('lehrling', 'evaluierungen', false),
  ('lehrling', 'arbeitsschutz', true),
  ('lehrling', 'lieferscheine', false),
  ('lehrling', 'lagerverwaltung', false),
  ('lehrling', 'admin_bereich', false),

  -- facharbeiter
  ('facharbeiter', 'zeiterfassung', true),
  ('facharbeiter', 'projekte', true),
  ('facharbeiter', 'meine_stunden', true),
  ('facharbeiter', 'regiearbeiten', false),
  ('facharbeiter', 'tagesberichte', false),
  ('facharbeiter', 'meine_dokumente', true),
  ('facharbeiter', 'dokumentenbibliothek', false),
  ('facharbeiter', 'stundenubersicht', false),
  ('facharbeiter', 'plantafel', false),
  ('facharbeiter', 'gerateverwaltung', false),
  ('facharbeiter', 'eingangsrechnungen', false),
  ('facharbeiter', 'evaluierungen', false),
  ('facharbeiter', 'arbeitsschutz', true),
  ('facharbeiter', 'lieferscheine', true),
  ('facharbeiter', 'lagerverwaltung', true),
  ('facharbeiter', 'admin_bereich', false),

  -- vorarbeiter
  ('vorarbeiter', 'zeiterfassung', true),
  ('vorarbeiter', 'projekte', true),
  ('vorarbeiter', 'meine_stunden', true),
  ('vorarbeiter', 'regiearbeiten', true),
  ('vorarbeiter', 'tagesberichte', true),
  ('vorarbeiter', 'meine_dokumente', true),
  ('vorarbeiter', 'dokumentenbibliothek', true),
  ('vorarbeiter', 'stundenubersicht', false),
  ('vorarbeiter', 'plantafel', true),
  ('vorarbeiter', 'gerateverwaltung', false),
  ('vorarbeiter', 'eingangsrechnungen', false),
  ('vorarbeiter', 'evaluierungen', true),
  ('vorarbeiter', 'arbeitsschutz', true),
  ('vorarbeiter', 'lieferscheine', true),
  ('vorarbeiter', 'lagerverwaltung', true),
  ('vorarbeiter', 'admin_bereich', false),

  -- admin
  ('admin', 'zeiterfassung', true),
  ('admin', 'projekte', true),
  ('admin', 'meine_stunden', true),
  ('admin', 'regiearbeiten', true),
  ('admin', 'tagesberichte', true),
  ('admin', 'meine_dokumente', false),
  ('admin', 'dokumentenbibliothek', true),
  ('admin', 'stundenubersicht', true),
  ('admin', 'plantafel', true),
  ('admin', 'gerateverwaltung', true),
  ('admin', 'eingangsrechnungen', true),
  ('admin', 'evaluierungen', true),
  ('admin', 'arbeitsschutz', true),
  ('admin', 'lieferscheine', true),
  ('admin', 'lagerverwaltung', true),
  ('admin', 'admin_bereich', true)
ON CONFLICT (role, menu_key) DO NOTHING;
