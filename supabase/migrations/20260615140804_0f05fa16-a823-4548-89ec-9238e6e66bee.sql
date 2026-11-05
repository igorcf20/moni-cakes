
CREATE POLICY "dtf_uploads_user_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dtf-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "dtf_uploads_user_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dtf-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "dtf_uploads_user_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dtf-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "dtf_uploads_guest_insert"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'dtf-uploads' AND (storage.foldername(name))[1] = 'guest');

CREATE POLICY "dtf_uploads_admin_all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'dtf-uploads' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'dtf-uploads' AND public.has_role(auth.uid(), 'admin'));

-- Resolve aviso pré-existente: torna a função update_updated_at_column SECURITY INVOKER (já é trivial e não precisa de privilégios elevados)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
