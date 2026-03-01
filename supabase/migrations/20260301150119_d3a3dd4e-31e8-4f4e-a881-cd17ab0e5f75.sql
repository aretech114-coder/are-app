
-- Function to list all app_role enum values
CREATE OR REPLACE FUNCTION public.get_enum_values()
RETURNS TABLE(value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.enumlabel::text as value
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'app_role'
  ORDER BY e.enumsortorder;
$$;

-- Function to add a new app_role enum value
CREATE OR REPLACE FUNCTION public.add_app_role(new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if value already exists
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = new_role
  ) THEN
    RAISE EXCEPTION 'Le rôle "%" already exists', new_role;
  END IF;
  
  EXECUTE format('ALTER TYPE public.app_role ADD VALUE %L', new_role);
END;
$$;
