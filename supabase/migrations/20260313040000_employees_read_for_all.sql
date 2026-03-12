-- Allow all authenticated users to read the employees list
-- Required for: Tagesberichte (anwesende Mitarbeiter auswählen), DailyReportForm
-- Previously, non-admins could only see their own employee record.
CREATE POLICY "Authenticated users can view all employees"
  ON public.employees FOR SELECT
  USING (auth.uid() IS NOT NULL);
