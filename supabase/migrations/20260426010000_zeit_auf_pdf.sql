-- Optionales Flag pro Tagesbericht: Zeiteintraege des Berichts-Erstellers
-- werden im PDF mit ausgegeben, wenn dieses Flag true ist.
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS zeit_auf_pdf BOOLEAN DEFAULT false NOT NULL;
