-- Limite effective 150 Mo (buckets + setting) ; libellé UI reste 100 Mo côté front.

UPDATE public.site_settings
SET
  setting_value = '150',
  description = 'Taille maximale effective par fichier pour le registre et le workflow (1–150 Mo).'
WHERE setting_key = 'max_upload_size_mb';

INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES (
  'max_upload_size_mb',
  '150',
  'number',
  'Taille max. pièces jointes (Mo)',
  'Taille maximale effective par fichier pour le registre et le workflow (1–150 Mo).'
)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description;

UPDATE storage.buckets
SET file_size_limit = 150 * 1024 * 1024
WHERE id IN ('mail-incoming', 'mail-documents');

CREATE OR REPLACE FUNCTION public.sync_mail_storage_file_size_limit(_max_mb integer DEFAULT 150)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_mb integer;
  v_bytes bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur';
  END IF;

  v_mb := GREATEST(1, LEAST(COALESCE(_max_mb, 150), 150));
  v_bytes := v_mb::bigint * 1024 * 1024;

  UPDATE storage.buckets
  SET file_size_limit = v_bytes
  WHERE id IN ('mail-incoming', 'mail-documents');

  RETURN v_mb;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_mail_storage_file_size_limit(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_mail_storage_file_size_limit(integer) TO authenticated;
