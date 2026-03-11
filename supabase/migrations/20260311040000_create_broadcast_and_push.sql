-- Broadcast messages (Firmen-Chat)
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  image_url TEXT,
  target_roles TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_broadcast_messages_created ON broadcast_messages(created_at DESC);
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read broadcasts"
  ON broadcast_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert broadcasts"
  ON broadcast_messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

CREATE POLICY "Admins can delete broadcasts"
  ON broadcast_messages FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE broadcast_messages;

-- Storage bucket for broadcast images
INSERT INTO storage.buckets (id, name, public) VALUES ('broadcast-chat', 'broadcast-chat', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated users can upload broadcast files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'broadcast-chat' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can read broadcast files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'broadcast-chat');

-- Push subscriptions for Web Push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);
