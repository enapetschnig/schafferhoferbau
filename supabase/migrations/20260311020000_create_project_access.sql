-- Project access control: which users can see which projects
CREATE TABLE IF NOT EXISTS project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE project_access ENABLE ROW LEVEL SECURITY;

-- Users can see their own access entries
CREATE POLICY "Users can see their own access"
  ON project_access FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can do everything with project_access
CREATE POLICY "Admins manage all access"
  ON project_access FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'administrator'
    )
  );
