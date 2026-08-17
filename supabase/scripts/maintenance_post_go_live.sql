-- Mise à jour des textes page maintenance (SANS désactiver le mode maintenance)
-- Les comptes utilisateurs restent tels quels (pas de réactivation bulk).
-- Le bouton « Se connecter » redirige vers la nouvelle plateforme (leurre visuel).

INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  (
    'maintenance_show_countdown',
    'false',
    'boolean',
    'Afficher le décompte maintenance',
    'Affiche le décompte tant que maintenance_until est dans le futur.'
  ),
  (
    'maintenance_button_label',
    'Se connecter',
    'text',
    'Libellé bouton maintenance',
    'Texte du bouton principal sur la page maintenance.'
  ),
  (
    'maintenance_button_url',
    'https://new.are-app.cloud',
    'text',
    'Cible bouton maintenance',
    'Vide = nouvelle plateforme ; login ou /auth = page de connexion ; sinon URL externe.'
  ),
  (
    'maintenance_footnote',
    'Saisissez votre adresse e-mail et le mot de passe initial qui vous a été communiqué — il ne s''agit pas de votre ancien mot de passe.',
    'text',
    'Note sous le bouton maintenance',
    'Message d''aide (mot de passe initial, etc.).'
  )
ON CONFLICT (setting_key) DO NOTHING;

UPDATE public.site_settings SET setting_value = 'Maintenance terminée', updated_at = now()
WHERE setting_key = 'maintenance_title';

UPDATE public.site_settings SET setting_value =
  'La plateforme est à nouveau disponible. Merci de cliquer sur « Se connecter » pour accéder à votre espace.',
  updated_at = now()
WHERE setting_key = 'maintenance_message';

UPDATE public.site_settings SET setting_value = '', updated_at = now()
WHERE setting_key = 'maintenance_until';

UPDATE public.site_settings SET setting_value = 'false', updated_at = now()
WHERE setting_key = 'maintenance_show_countdown';

UPDATE public.site_settings SET setting_value = 'Se connecter', updated_at = now()
WHERE setting_key = 'maintenance_button_label';

UPDATE public.site_settings SET setting_value = 'https://new.are-app.cloud', updated_at = now()
WHERE setting_key = 'maintenance_button_url';

UPDATE public.site_settings SET setting_value =
  'Saisissez votre adresse e-mail et le mot de passe initial qui vous a été communiqué — il ne s''agit pas de votre ancien mot de passe.',
  updated_at = now()
WHERE setting_key = 'maintenance_footnote';

-- NE PAS toucher maintenance_enabled : vous le désactivez vous-même quand vous le souhaitez.
