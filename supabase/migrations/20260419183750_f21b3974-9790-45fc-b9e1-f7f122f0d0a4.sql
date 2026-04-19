CREATE POLICY "Public can read login appearance settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (setting_key IN (
  'site_title','site_subtitle','sidebar_initials','sidebar_logo_url',
  'favicon_url','primary_color','login_bg_color','login_bg_image_url',
  'show_remember_me','show_forgot_password'
));