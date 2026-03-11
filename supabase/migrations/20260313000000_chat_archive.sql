-- Add archive support to chat_channels

ALTER TABLE chat_channels
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Update SELECT policy: archived channels only visible to admins
DROP POLICY IF EXISTS "Users can read their channels" ON chat_channels;
CREATE POLICY "Users can read their channels"
  ON chat_channels FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    OR (
      is_archived = false AND (
        created_by = auth.uid()
        OR (channel_type = 'broadcast' AND (
          cardinality(target_roles) = 0
          OR EXISTS (
            SELECT 1 FROM employees e
            WHERE e.user_id = auth.uid()
            AND e.kategorie = ANY(target_roles)
          )
        ))
        OR (channel_type = 'direct' AND target_user_id = auth.uid())
      )
    )
  );

-- Allow admins to update channels (for archiving/restoring)
DROP POLICY IF EXISTS "Admins can update channels" ON chat_channels;
CREATE POLICY "Admins can update channels"
  ON chat_channels FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );
