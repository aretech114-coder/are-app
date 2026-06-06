-- Étendre la lecture Storage mail-documents aux sous-dossiers validations/ et deposits/

CREATE OR REPLACE FUNCTION public.storage_mail_id_from_documents_path(_object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(_object_name, '/', 1) IN ('treatments', 'annotations', 'validations', 'deposits')
      AND split_part(_object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(_object_name, '/', 2)::uuid
    ELSE NULL
  END;
$$;

NOTIFY pgrst, 'reload schema';
