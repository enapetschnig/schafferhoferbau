-- worker_goals: Partial-Unique-Indexe durch echte UNIQUE-Constraints ersetzen.
--
-- Hintergrund: Die ursprueglichen Indexe waren partial (WHERE scope='day' bzw 'week').
-- Supabase JS upsert mit onConflict="user_id,datum" findet partial indexes nicht
-- ohne expliziten WHERE-Filter — alle Tagesziele wurden dadurch still verworfen.
-- Da bei scope=day datum gesetzt ist und week_start NULL (und umgekehrt), und
-- Postgres mehrere NULL-Werte in einer UNIQUE-Spalte erlaubt, decken die echten
-- UNIQUE-Constraints denselben Fall ohne Partial-Filter ab.

DROP INDEX IF EXISTS public.uniq_worker_goals_user_day;
DROP INDEX IF EXISTS public.uniq_worker_goals_user_week;

ALTER TABLE public.worker_goals
  DROP CONSTRAINT IF EXISTS worker_goals_user_id_datum_key,
  DROP CONSTRAINT IF EXISTS worker_goals_user_id_week_start_key;

ALTER TABLE public.worker_goals
  ADD CONSTRAINT worker_goals_user_id_datum_key UNIQUE (user_id, datum),
  ADD CONSTRAINT worker_goals_user_id_week_start_key UNIQUE (user_id, week_start);
