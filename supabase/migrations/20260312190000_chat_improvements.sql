-- Allow all authenticated users to send broadcast messages (bidirectional company chat)
DROP POLICY IF EXISTS "Admins and vorarbeiter can insert broadcasts" ON broadcast_messages;
DROP POLICY IF EXISTS "Admins can insert broadcasts" ON broadcast_messages;
CREATE POLICY "Authenticated users can insert broadcasts"
  ON broadcast_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete own broadcast messages, admins can delete any
DROP POLICY IF EXISTS "Admins can delete broadcasts" ON broadcast_messages;
CREATE POLICY "Own or admin can delete broadcasts"
  ON broadcast_messages FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );
