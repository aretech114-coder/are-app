
CREATE OR REPLACE FUNCTION public.notify_password_reset_request(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, title, message)
  SELECT ur.user_id,
         'Demande de réinitialisation',
         'L''utilisateur ' || _email || ' a demandé une réinitialisation de mot de passe.'
  FROM user_roles ur
  WHERE ur.role IN ('superadmin', 'admin');
END;
$$;

-- Allow anon and authenticated to execute
GRANT EXECUTE ON FUNCTION public.notify_password_reset_request(text) TO anon;
GRANT EXECUTE ON FUNCTION public.notify_password_reset_request(text) TO authenticated;
