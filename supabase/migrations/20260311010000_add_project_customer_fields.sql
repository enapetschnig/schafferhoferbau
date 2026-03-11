-- Add customer and additional info fields to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kunde_telefon TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kunde_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS erreichbarkeit TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS besonderheiten TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hinweise TEXT;
