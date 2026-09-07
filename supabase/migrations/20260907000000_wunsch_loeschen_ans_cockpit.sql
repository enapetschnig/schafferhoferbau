-- Geloeschte Aenderungswuensche ans CRM melden
--
-- Der bisherige Trigger feuert nur bei INSERT und UPDATE. Loescht ein Admin
-- eine Meldung in der App, bleibt sie im CRM stehen - dort standen dadurch
-- Testmeldungen vom 31.08.2026 eine Woche lang auf "neu".
--
-- Gesendet wird der ALTE Datensatz mit status='geloescht'. Das ist bewusst so
-- gewaehlt, damit die Reihenfolge der Ausrollung egal ist:
--   * CRM unveraendert -> speichert 'geloescht'; der Eintrag wird als graues
--     Abzeichen sichtbar und taucht nicht mehr faelschlich als "neu" auf.
--   * CRM erweitert     -> kann daraufhin die Zeile wirklich entfernen.
-- Ein zurueckgesetztes "neu" (und damit ein Telegram-Ping) kann so nicht
-- passieren; zusaetzlich unterdrueckt x-kein-ping den Ping ausdruecklich.

CREATE OR REPLACE FUNCTION public.wunsch_geloescht_ans_cockpit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v public.cockpit_verbindung%ROWTYPE;
  melder text;
BEGIN
  SELECT * INTO v FROM public.cockpit_verbindung LIMIT 1;
  IF v IS NULL THEN
    RETURN OLD;                     -- Verbindung nicht eingerichtet: still
  END IF;

  SELECT NULLIF(TRIM(CONCAT(p.vorname, ' ', p.nachname)), '')
    INTO melder FROM public.profiles p WHERE p.id = OLD.erstellt_von;

  PERFORM net.http_post(
    url := v.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-app-key', v.app_key,
      'x-cockpit-secret', v.secret,
      'x-kein-ping', '1'
    ),
    body := jsonb_build_object(
      'id',              OLD.id,
      'art',             OLD.art,
      'status',          'geloescht',
      -- Der Eingang verlangt einen nicht-leeren Text (sonst HTTP 400). Bei
      -- reinen Sprachnachrichten ohne fertige Abschrift ist er leer.
      'text',            COALESCE(NULLIF(TRIM(OLD.text), ''), '(gelöscht)'),
      'antwort',         OLD.antwort,
      'seite',           OLD.seite,
      'bild_pfad',       OLD.bild_pfad,
      'audio_pfad',      OLD.audio_pfad,
      'melder',          COALESCE(melder, ''),
      'erstellt_am',     OLD.created_at,
      'aktualisiert_am', now()
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_wunsch_cockpit_geloescht ON public.aenderungswuensche;
CREATE TRIGGER trg_wunsch_cockpit_geloescht
  AFTER DELETE ON public.aenderungswuensche
  FOR EACH ROW EXECUTE FUNCTION public.wunsch_geloescht_ans_cockpit();
