-- Beliebig viele zusaetzliche Adressen pro Projekt mit eigener Bezeichnung
-- (z.B. Wohnadresse des Bauherrn, Lieferadresse, Sammelpunkt, etc.).
-- Format: [{ "label": "Wohnadresse", "adresse": "Hauptstr 1, 8010 Graz" }, ...]
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS weitere_adressen JSONB NOT NULL DEFAULT '[]'::jsonb;
