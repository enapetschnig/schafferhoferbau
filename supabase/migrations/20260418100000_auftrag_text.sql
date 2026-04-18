-- Auftraege koennen auch als Text erfasst werden (neben Datei-Upload)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS text_content TEXT;
-- file_url optional machen falls nur Text
ALTER TABLE documents ALTER COLUMN file_url DROP NOT NULL;
