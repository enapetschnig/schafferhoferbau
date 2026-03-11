-- Fix SELECT policy: only project members and admins
DROP POLICY IF EXISTS "Authenticated users can read messages" ON project_messages;

CREATE POLICY "Project members and admins can read messages"
  ON project_messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM project_access pa WHERE pa.project_id = project_messages.project_id AND pa.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

-- Fix INSERT policy: only project members and admins
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON project_messages;

CREATE POLICY "Project members and admins can insert messages"
  ON project_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (SELECT 1 FROM project_access pa WHERE pa.project_id = project_messages.project_id AND pa.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    )
  );

-- Fix DELETE policy: own messages or admin
DROP POLICY IF EXISTS "Users can delete own messages" ON project_messages;

CREATE POLICY "Users can delete own messages or admins all"
  ON project_messages FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );
