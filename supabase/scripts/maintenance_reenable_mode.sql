-- Si vous avez exécuté une ancienne version du script qui a désactivé le mode maintenance,
-- relancez ceci pour le réactiver (admin/super admin accèdent toujours à l'app via /auth).

UPDATE public.site_settings SET setting_value = 'true', updated_at = now()
WHERE setting_key = 'maintenance_enabled';
