-- ============================================================
-- Fix: Fehlende RLS UPDATE Policies
-- (Gefunden durch Integration-Test gegen Live-DB)
-- ============================================================

-- Fix 1: documents - Archiv/Unarchiv Feature war kaputt
-- Ohne UPDATE Policy konnte niemand archived=true/false setzen
CREATE POLICY "Authenticated can update documents" ON documents
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Fix 2: monthly_signoffs - Re-Sign nach Admin-Invalidierung war kaputt
-- User konnten eigene Signoffs nicht upserten (UPDATE-Teil fehlte)
CREATE POLICY "Users can update own signoffs" ON monthly_signoffs
  FOR UPDATE USING (auth.uid() = user_id);

-- Fix 3: bestellungen - MA konnte Chef-Bestellung nicht als vollstaendig markieren
-- Status-Update war nur fuer Ersteller moeglich, aber MA muss Chef-Bestellungen pruefen
CREATE POLICY "Authenticated can update bestellungen" ON bestellungen
  FOR UPDATE USING (auth.role() = 'authenticated');
