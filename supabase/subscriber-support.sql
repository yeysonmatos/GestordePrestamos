-- subscriber-support.sql
-- Habilita el flujo de suscriptor: adjuntos de tickets visibles para ambas partes
-- y datos de cuenta de cobro legibles para reportar pagos.

-- 1) Storage bucket "documents": carpeta pública-de-soporte "support/" (tickets).
--    Las políticas por prefijo de usuario siguen vigentes; SUMA, no reemplaza.
DROP POLICY IF EXISTS "support attachments select" ON storage.objects;
CREATE POLICY "support attachments select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'support');

DROP POLICY IF EXISTS "support attachments insert" ON storage.objects;
CREATE POLICY "support attachments insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = 'support');

-- 2) platform_config: el suscriptor necesita ver la cuenta donde deposita.
DROP POLICY IF EXISTS "platform_config read authenticated" ON public.platform_config;
CREATE POLICY "platform_config read authenticated"
  ON public.platform_config FOR SELECT
  TO authenticated
  USING (id = '00000000-0000-0000-0000-000000000001');
