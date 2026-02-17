
-- Update handle_new_user to assign superadmin role to the first user, agent to others
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count integer;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  SELECT count(*) INTO user_count FROM public.user_roles;

  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'superadmin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'agent');
  END IF;

  RETURN NEW;
END;
$$;
