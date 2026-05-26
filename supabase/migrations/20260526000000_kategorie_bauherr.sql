-- Neue Mitarbeiter-Kategorie "bauherr": Bauherren, die auf ihren eigenen
-- Baustellen mitarbeiten (Eigenleistung) und in den Stundenauswertungen
-- ueblicherweise nicht mitgezaehlt werden sollen. Werden technisch wie
-- externe Mitarbeiter ueber external_employee_projects pro Baustelle
-- freigegeben.

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_kategorie_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_kategorie_check
  CHECK (kategorie IN ('lehrling', 'facharbeiter', 'vorarbeiter', 'extern', 'bauherr'));
