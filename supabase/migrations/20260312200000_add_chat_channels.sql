-- Add chat_channels table for multi-tab company chat
-- Each channel can target specific roles (broadcast) or a single user (direct)

CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'broadcast',
    -- 'broadcast': all users or role-filtered
    -- 'direct': 1:1 between creator and one employee
  target_roles TEXT[] DEFAULT '{}',   -- empty = all roles visible
  target_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- only for 'direct'
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

-- Add to realtime publication (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_channels;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin sees all channels
-- Employees see broadcast channels for their role (or all-roles channels)
-- Employees see direct channels where they are the target
DROP POLICY IF EXISTS "Users can read their channels" ON chat_channels;
CREATE POLICY "Users can read their channels"
  ON chat_channels FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    OR created_by = auth.uid()
    OR (
      channel_type = 'broadcast' AND (
        cardinality(target_roles) = 0
        OR EXISTS (
          SELECT 1 FROM employees e
          WHERE e.user_id = auth.uid() AND e.kategorie = ANY(target_roles)
        )
      )
    )
    OR (channel_type = 'direct' AND target_user_id = auth.uid())
  );

-- Only admins can create channels
DROP POLICY IF EXISTS "Admins can insert channels" ON chat_channels;
CREATE POLICY "Admins can insert channels"
  ON chat_channels FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

-- Only admins can delete channels
DROP POLICY IF EXISTS "Admins can delete channels" ON chat_channels;
CREATE POLICY "Admins can delete channels"
  ON chat_channels FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

-- Add channel_id to broadcast_messages for per-channel grouping
ALTER TABLE broadcast_messages
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_channel
  ON broadcast_messages(channel_id, created_at);
