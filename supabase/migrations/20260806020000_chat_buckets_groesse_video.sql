-- Chat-Anhaenge: Videos erlauben und ein klares Groessenlimit setzen
--
-- Die beiden Chat-Buckets hatten bisher KEIN eigenes file_size_limit - es galt
-- still das projektweite Limit. Ein zu grosses Video lief damit in einen
-- unspezifischen Serverfehler. Jetzt ist das Limit explizit und deckt sich mit
-- der Pruefung im Frontend (MAX_CHAT_FILE_SIZE in src/lib/chatAttachments.ts).
--
-- ACHTUNG: Supabase begrenzt Uploads ZUSAETZLICH projektweit (Standard 50 MB).
-- Ein hoeherer Wert hier wirkt erst, wenn auch das Projektlimit unter
-- Dashboard -> Storage -> Settings -> "Upload file size limit" angehoben wird.
-- Beide Werte muessen zusammenpassen, sonst greift weiterhin der kleinere.

UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 MB
WHERE id IN ('project-chat', 'broadcast-chat');
