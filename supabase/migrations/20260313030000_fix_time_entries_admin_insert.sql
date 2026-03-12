-- Allow admins to insert time entries for any user (e.g. entering hours for an extern employee)
DROP POLICY IF EXISTS "Admins can insert any time entries" ON public.time_entries;

CREATE POLICY "Admins can insert any time entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'administrator'
    )
  );
