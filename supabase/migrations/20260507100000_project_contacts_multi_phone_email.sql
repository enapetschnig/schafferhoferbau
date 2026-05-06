-- Pro Kontakt mehrere Telefonnummern + E-Mails moeglich
-- (zusaetzlich zur bestehenden Haupt-telefon und Haupt-email)
ALTER TABLE public.project_contacts
  ADD COLUMN IF NOT EXISTS weitere_telefone JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weitere_emails JSONB NOT NULL DEFAULT '[]'::jsonb;
