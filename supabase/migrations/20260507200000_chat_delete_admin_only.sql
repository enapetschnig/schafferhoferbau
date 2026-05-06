-- Nur Administratoren duerfen Chat-Nachrichten loeschen
-- (vorher konnte jeder seine eigenen Nachrichten loeschen)

DROP POLICY IF EXISTS "Users can delete own messages or admins all" ON public.project_messages;
CREATE POLICY "Only admins can delete project messages" ON public.project_messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'administrator')
  );

DROP POLICY IF EXISTS "Own or admin can delete broadcasts" ON public.broadcast_messages;
CREATE POLICY "Only admins can delete broadcast messages" ON public.broadcast_messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'administrator')
  );
