-- Fix role assignment for new user registrations:
-- holzknecht.natursteine@gmail.com always gets administrator
-- All other new users automatically get mitarbeiter
-- Manually granted admin rights for other users are NOT affected

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Owner email always gets administrator, everyone else gets mitarbeiter
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email = 'holzknecht.natursteine@gmail.com' THEN 'administrator'::app_role
      ELSE 'mitarbeiter'::app_role
    END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create profile entry
  INSERT INTO public.profiles (id, vorname, nachname)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Ensure holzknecht.natursteine@gmail.com always has the administrator role
-- (in case the account already exists without the role)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'administrator'::app_role
FROM auth.users
WHERE email = 'holzknecht.natursteine@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
