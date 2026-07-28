-- Lesebestaetigungen im Chat (WhatsApp-Stil): pro Nachricht wird festgehalten,
-- welcher Mitarbeiter sie wann gelesen hat.
--
-- Zwei Tabellen, weil es zwei getrennte Nachrichten-Quellen gibt:
--   project_messages   -> message_reads
--   broadcast_messages -> broadcast_message_reads
--
-- Sichtbarkeit (User-Entscheidung): der ABSENDER der Nachricht und
-- ADMINISTRATOREN duerfen sehen, wer gelesen hat. Jeder sieht ausserdem
-- seinen eigenen Eintrag (harmlos, vereinfacht das Frontend).
-- Schreiben darf jeder ausschliesslich fuer sich selbst.

-- ===== Projekt-Chat =====
CREATE TABLE IF NOT EXISTS public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.project_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_message ON public.message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user ON public.message_reads(user_id);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reads_select" ON public.message_reads;
CREATE POLICY "message_reads_select" ON public.message_reads
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.project_messages m
      WHERE m.id = message_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'administrator'::app_role
    )
  );

DROP POLICY IF EXISTS "message_reads_insert_own" ON public.message_reads;
CREATE POLICY "message_reads_insert_own" ON public.message_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===== Firmen-Chat (Broadcast-Kanaele) =====
CREATE TABLE IF NOT EXISTS public.broadcast_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_reads_message ON public.broadcast_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_reads_user ON public.broadcast_message_reads(user_id);

ALTER TABLE public.broadcast_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcast_reads_select" ON public.broadcast_message_reads;
CREATE POLICY "broadcast_reads_select" ON public.broadcast_message_reads
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.broadcast_messages m
      WHERE m.id = message_id AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'administrator'::app_role
    )
  );

DROP POLICY IF EXISTS "broadcast_reads_insert_own" ON public.broadcast_message_reads;
CREATE POLICY "broadcast_reads_insert_own" ON public.broadcast_message_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Realtime, damit die Haken live umspringen wenn jemand liest.
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_message_reads;
