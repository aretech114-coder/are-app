INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description)
VALUES
  ('authority_title_short', 'Ministre', 'text', 'Titre de l''autorité (court)', 'Forme courte du titre de l''autorité supérieure (ex. DG, Ministre). Utilisée dans les boutons et étiquettes compactes.'),
  ('authority_title_long',  'Ministre', 'text', 'Titre de l''autorité (long)',  'Forme longue du titre de l''autorité supérieure (ex. Directeur Général, Ministre). Utilisée dans les phrases et descriptions.')
ON CONFLICT (setting_key) DO NOTHING;