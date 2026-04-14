-- ============================================================
-- Dashboard: Motivationssprueche + Wetter-Einstellungen
-- ============================================================

-- Dashboard-Nachricht (Admin editierbar, wird ganz oben angezeigt)
INSERT INTO app_settings (key, value) VALUES
  ('dashboard_message', 'Willkommen bei Schafferhofer Bau! Sicherheit geht vor.')
ON CONFLICT (key) DO NOTHING;
