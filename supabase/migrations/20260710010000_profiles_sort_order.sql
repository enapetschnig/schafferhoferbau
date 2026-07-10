-- Freie Sortierung der Mitarbeiter-Liste: Admin ordnet die "Registrierten
-- Benutzer" per Drag&Drop. Die Reihenfolge gilt ueberall, wo Mitarbeiter
-- ausgewaehlt werden (Zeiterfassung, Berichterstellung, Admin-Liste).
-- NULL = noch nie einsortiert → wird hinter den sortierten einsortiert
-- (nullsFirst: false in den Queries), innerhalb dessen alphabetisch.
--
-- Schreibrecht: die bestehende Policy "Admins can update all profiles"
-- deckt sort_order-Updates ab — keine neue Policy noetig.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_profiles_sort_order
  ON public.profiles (sort_order)
  WHERE sort_order IS NOT NULL;
