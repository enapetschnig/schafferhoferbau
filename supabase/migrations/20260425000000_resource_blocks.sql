-- Konsolidierte Tabelle: tag-genaue Ressourcen-Bloecke fuer Wochen- und Jahres-Plantafel
-- Loest yearly_resource_blocks (Wochen-basiert) und assignment_resources (Tag-basiert, single-day) ab.
-- Bestehende Daten werden bei der Migration uebernommen.

CREATE TABLE IF NOT EXISTS public.resource_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  label TEXT,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_resource_blocks_dates ON public.resource_blocks (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_resource_blocks_resource ON public.resource_blocks (resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_blocks_project ON public.resource_blocks (project_id);

ALTER TABLE public.resource_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_blocks_all_authenticated" ON public.resource_blocks;
CREATE POLICY "resource_blocks_all_authenticated"
  ON public.resource_blocks FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Migration: yearly_resource_blocks (Wochen) -> resource_blocks (Tage)
INSERT INTO public.resource_blocks (resource_id, project_id, start_date, end_date, label, sort_order, created_by, created_at)
SELECT
  resource_id,
  project_id,
  to_date(year::text || '-W' || lpad(start_week::text, 2, '0') || '-1', 'IYYY-"W"IW-ID') AS start_date,
  to_date(year::text || '-W' || lpad(end_week::text, 2, '0') || '-7', 'IYYY-"W"IW-ID') AS end_date,
  label,
  COALESCE(sort_order, 0),
  created_by,
  created_at
FROM public.yearly_resource_blocks
ON CONFLICT DO NOTHING;

-- Migration: assignment_resources (single-day) -> resource_blocks
-- resource_name -> resource_id via Master-Lookup; nur wenn Match existiert
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
JOIN public.resources r ON LOWER(r.name) = LOWER(ar.resource_name)
ON CONFLICT DO NOTHING;
