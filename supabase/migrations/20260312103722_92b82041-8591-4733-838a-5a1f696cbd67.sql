
-- Site settings key-value table
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text NOT NULL DEFAULT '',
  setting_type text NOT NULL DEFAULT 'text',
  label text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read settings (needed for favicon, title, etc.)
CREATE POLICY "Authenticated read site_settings" ON public.site_settings
  FOR SELECT TO authenticated USING (true);

-- Only superadmin can modify
CREATE POLICY "SuperAdmin manage site_settings" ON public.site_settings
  FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Admin can modify if permission enabled
CREATE POLICY "Admin manage site_settings" ON public.site_settings
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM admin_permissions
      WHERE permission_key = 'manage_site_settings' AND is_enabled = true
    )
  );

-- Seed default settings
INSERT INTO public.site_settings (setting_key, setting_value, setting_type, label, description) VALUES
  ('site_title', 'CourierPro', 'text', 'Titre de la plateforme', 'Le titre affiché dans l''onglet du navigateur'),
  ('site_subtitle', 'Gestion Courrier', 'text', 'Sous-titre', 'Affiché sous le titre dans la barre latérale'),
  ('sidebar_initials', 'CP', 'text', 'Initiales du logo', 'Les initiales affichées dans le logo de la barre latérale'),
  ('favicon_url', '', 'text', 'URL du Favicon', 'URL de l''icône affichée dans l''onglet du navigateur (laisser vide pour le défaut)'),
  ('sidebar_logo_url', '', 'text', 'URL du logo sidebar', 'URL d''une image pour remplacer les initiales dans la barre latérale'),
  ('allow_indexing', 'false', 'boolean', 'Indexation SEO', 'Autoriser les moteurs de recherche à indexer le site');

-- Add admin permission for site settings
INSERT INTO public.admin_permissions (permission_key, label, description)
VALUES ('manage_site_settings', 'Gérer les paramètres du site', 'Permet de modifier le titre, favicon, logo et les paramètres SEO');
