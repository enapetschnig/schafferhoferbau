-- Plan-Favoriten werden global: vom Admin gesetzte Favoriten gelten fuer
-- alle Anwender (User-Wunsch: "Plaene, die ich als Favoriten markiere,
-- sollen automatisch auch bei allen Mitarbeitern als Favoriten angezeigt
-- werden").
--
-- Aenderungen:
--  1. Dedupe bestehender Eintraege (mehrere User hatten denselben Plan
--     favorisiert) — pro (project_id, file_name/document_id) bleibt der
--     aelteste Eintrag.
--  2. Unique-Indizes ohne user_id.
--  3. user_id wird nullable (dokumentiert nur noch, wer den Favorit gesetzt
--     hat).
--  4. RLS: Lesen fuer alle authentifizierten User, Schreiben/Loeschen nur
--     Admin.

-- 1. Duplikate entfernen (aeltester Eintrag pro Plan bleibt)
DELETE FROM public.plan_favorites a
USING public.plan_favorites b
WHERE a.id <> b.id
  AND a.project_id = b.project_id
  AND a.file_name IS NOT DISTINCT FROM b.file_name
  AND a.document_id IS NOT DISTINCT FROM b.document_id
  AND a.created_at > b.created_at;

-- 2. Alte user-basierte Unique-Indizes durch globale ersetzen
DROP INDEX IF EXISTS uq_plan_fav_file;
DROP INDEX IF EXISTS uq_plan_fav_doc;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_fav_file
  ON public.plan_favorites (project_id, file_name)
  WHERE file_name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_fav_doc
  ON public.plan_favorites (project_id, document_id)
  WHERE document_id IS NOT NULL;

-- 3. user_id nullable — nur noch Info "wer hat gesetzt"
ALTER TABLE public.plan_favorites ALTER COLUMN user_id DROP NOT NULL;

-- 4. RLS neu: alle lesen, nur Admin schreibt
DROP POLICY IF EXISTS "plan_fav_select_own" ON public.plan_favorites;
CREATE POLICY "plan_fav_select_all" ON public.plan_favorites
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "plan_fav_insert_own" ON public.plan_favorites;
CREATE POLICY "plan_fav_insert_admin" ON public.plan_favorites
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );

DROP POLICY IF EXISTS "plan_fav_delete_own" ON public.plan_favorites;
CREATE POLICY "plan_fav_delete_admin" ON public.plan_favorites
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'administrator'::app_role)
  );
