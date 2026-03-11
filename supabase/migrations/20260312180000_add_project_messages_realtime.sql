-- Add project_messages to realtime publication so chat syncs in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE project_messages;

-- Allow vorarbeiter to send broadcast messages (company chat)
DROP POLICY IF EXISTS "Admins can insert broadcasts" ON broadcast_messages;
CREATE POLICY "Admins and vorarbeiter can insert broadcasts"
  ON broadcast_messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  );
