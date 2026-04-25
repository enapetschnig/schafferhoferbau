-- Konsolidierung: Restdaten aus assignment_resources nach resource_blocks migrieren,
-- dann alte Tabellen droppen.
--
-- Hintergrund: Migration 20260425000000 hat resource_blocks angelegt und die Master-Name-
-- exakte Daten kopiert. Diese Folge-Migration ergaenzt Fuzzy-Matches und legt fehlende
-- Master-Ressourcen an.

-- 1. Fehlende Master-Ressourcen anlegen (die in assignment_resources verwendet wurden,
--    aber nicht in der resources-Tabelle existieren)
INSERT INTO public.resources (name, kategorie, einheit, farbe, is_active)
SELECT 'Bagger', 'geraet', 'Stk', '#F59E0B', true
WHERE NOT EXISTS (SELECT 1 FROM public.resources WHERE LOWER(name) = 'bagger');

INSERT INTO public.resources (name, kategorie, einheit, farbe, is_active)
SELECT 'Aluschalung', 'schalung', 'm²', '#60A5FA', true
WHERE NOT EXISTS (SELECT 1 FROM public.resources WHERE LOWER(name) = 'aluschalung');

-- 2. Restliche assignment_resources mit Fuzzy-Mapping migrieren (idempotent)
INSERT INTO public.resource_blocks (resource_id, project_id, start_date, end_date, label, sort_order, created_at)
SELECT
  r.id,
  ar.project_id,
  ar.datum,
  ar.datum,
  CASE WHEN ar.menge IS NOT NULL THEN ar.menge::text || ' ' || COALESCE(ar.einheit, '') ELSE NULL END,
  0,
  now()
FROM public.assignment_resources ar
JOIN public.resources r ON
  LOWER(r.name) = LOWER(ar.resource_name)
  OR (LOWER(ar.resource_name) = 'deckenschalung (m²)' AND LOWER(r.name) = 'deckenschalung')
  OR (LOWER(ar.resource_name) = 'transport' AND LOWER(r.name) = 'transport lkw')
WHERE NOT EXISTS (
  SELECT 1 FROM public.resource_blocks rb
  WHERE rb.resource_id = r.id
    AND rb.start_date = ar.datum
    AND rb.end_date = ar.datum
    AND COALESCE(rb.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(ar.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 3. Alte Tabellen droppen — werden vom Code nicht mehr verwendet
DROP TABLE IF EXISTS public.assignment_resources CASCADE;
DROP TABLE IF EXISTS public.yearly_resource_blocks CASCADE;
