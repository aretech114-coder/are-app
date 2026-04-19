INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  ('login_logo_url', '', 'image', 'Logo de la page de connexion', 'Logo affiché dans le formulaire de connexion (différent du logo de la sidebar)'),
  ('show_login_title', 'true', 'boolean', 'Afficher le titre sur la page de connexion', 'Affiche ou masque le titre de la plateforme et le sous-titre dans le formulaire de connexion')
ON CONFLICT (setting_key) DO NOTHING;