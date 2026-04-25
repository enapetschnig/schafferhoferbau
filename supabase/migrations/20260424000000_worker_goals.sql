-- User-spezifische Tages- und Wochenziele, die Admin/Vorarbeiter pro MA in
-- der Plantafel eintragen können. Der MA sieht sie im Dashboard-Widget.
-- Bisher gab es nur project_daily_targets (Ziel pro Projekt-Tag) — das war
-- projektbezogen. worker_goals ist MA-bezogen.

CREATE TABLE IF NOT EXISTS public.worker_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('day', 'week')),
  datum DATE,
  week_start DATE,
  ziel TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (
    (scope = 'day' AND datum IS NOT NULL AND week_start IS NULL)
    OR (scope = 'week' AND week_start IS NOT NULL AND datum IS NULL)
  )
);

-- Eindeutigkeit pro User + Bezugsdatum/-woche (partial indexes, da eines davon null ist)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_worker_goals_user_day
  ON public.worker_goals (user_id, datum) WHERE scope = 'day';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_worker_goals_user_week
  ON public.worker_goals (user_id, week_start) WHERE scope = 'week';

ALTER TABLE public.worker_goals ENABLE ROW LEVEL SECURITY;

-- User sieht nur eigene Ziele
DROP POLICY IF EXISTS worker_goals_select_own ON public.worker_goals;
CREATE POLICY worker_goals_select_own ON public.worker_goals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin + Vorarbeiter sehen und verwalten alles
DROP POLICY IF EXISTS worker_goals_admin_vorarbeiter_all ON public.worker_goals;
CREATE POLICY worker_goals_admin_vorarbeiter_all ON public.worker_goals
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'administrator')
    OR EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND kategorie = 'vorarbeiter')
  );

CREATE INDEX IF NOT EXISTS idx_worker_goals_user_date ON public.worker_goals(user_id, datum DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_worker_goals_user_week ON public.worker_goals(user_id, week_start DESC NULLS LAST);
