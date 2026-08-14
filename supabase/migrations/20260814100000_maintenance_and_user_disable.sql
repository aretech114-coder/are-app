-- Bulk account disable + planned maintenance page
-- Exécution manuelle : Staging puis Production (SQL Editor)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_disabled
  ON public.profiles (is_disabled)
  WHERE is_disabled = true;

INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  (
    'maintenance_enabled',
    'false',
    'boolean',
    'Mode maintenance',
    'Active la page de maintenance pour tous les visiteurs (sauf super administrateur connecté).'
  ),
  (
    'maintenance_until',
    '',
    'text',
    'Fin de maintenance prévue',
    'Date et heure ISO du décompte affiché sur la page de maintenance.'
  ),
  (
    'maintenance_title',
    'Maintenance planifiée',
    'text',
    'Titre page maintenance',
    'Titre affiché sur la page de maintenance.'
  ),
  (
    'maintenance_message',
    'La plateforme est temporairement indisponible. Merci de revenir un peu plus tard.',
    'text',
    'Message page maintenance',
    'Texte d''information affiché sous le titre.'
  ),
  (
    'maintenance_bg_image_url',
    '',
    'image',
    'Fond page maintenance',
    'Image d''arrière-plan de la page de maintenance.'
  )
ON CONFLICT (setting_key) DO NOTHING;
