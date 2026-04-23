-- daily_reports.report_type akzeptiert jetzt auch 'regiebericht'.
-- Der Code in DailyReportForm, DailyReports-Filter und generateDailyReportPDF
-- unterstuetzt den Typ bereits seit laengerem, aber der CHECK-Constraint
-- wurde nie angepasst. Folge: Regiebericht-Erstellung scheitert mit
-- "violates check constraint daily_reports_report_type_check".

ALTER TABLE public.daily_reports
  DROP CONSTRAINT IF EXISTS daily_reports_report_type_check;

ALTER TABLE public.daily_reports
  ADD CONSTRAINT daily_reports_report_type_check
  CHECK (report_type = ANY (ARRAY['tagesbericht'::text, 'zwischenbericht'::text, 'regiebericht'::text]));
